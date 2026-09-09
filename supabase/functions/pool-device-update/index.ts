import { createClient } from "jsr:@supabase/supabase-js@2";

const AUTO_SWIM_WINDOW_MINUTES = 5;
const AUTO_SWIM_REQUIRED_CHANGES = 4;
const SWIMMING_MODE_DURATION_MINUTES = 60;

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

async function sendPush(
  title: string,
  body: string,
  status: string,
) {
  const supabaseUrl =
    Deno.env.get("SUPABASE_URL");

  const pushSecret =
    Deno.env.get("PUSH_ADMIN_SECRET");

  if (!supabaseUrl || !pushSecret) {
    console.error(
      "Push configuration is missing"
    );

    return false;
  }

  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/send-push`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          "x-push-secret":
            pushSecret,
        },

        body: JSON.stringify({
          title,
          body,
          status,
        }),
      },
    );

    if (!response.ok) {
      console.error(
        "Push function failed:",
        response.status,
        await response.text(),
      );

      return false;
    }

    console.log(
      "Push sent:",
      await response.text(),
    );

    return true;

  } catch (error) {
    console.error(
      "Could not call Push function:",
      error,
    );

    return false;
  }
}


/*
  Counts real water-level transitions.

  Example:

  Normal
  Normal
  High
  High
  Normal
  Low
  Normal

  = 4 changes

  Error is ignored completely.
*/
function countWaterTransitions(
  rows: Array<{ status: string }>,
) {
  const validStatuses = [
    "Low",
    "Normal",
    "High",
  ];

  let previousValidStatus:
    string | null = null;

  let changes = 0;

  for (const row of rows) {
    if (
      !validStatuses.includes(
        row.status
      )
    ) {
      continue;
    }

    if (
      previousValidStatus !== null &&
      row.status !== previousValidStatus
    ) {
      changes++;
    }

    previousValidStatus =
      row.status;
  }

  return changes;
}


Deno.serve(async (request) => {
  try {

    // ---------------------------------------
    // METHOD
    // ---------------------------------------

    if (request.method !== "POST") {
      return jsonResponse(
        {
          error:
            "Method not allowed",
        },
        405,
      );
    }


    // ---------------------------------------
    // DEVICE AUTHENTICATION
    // ---------------------------------------

    const receivedSecret =
      request.headers.get(
        "x-device-secret"
      );

    const expectedSecret =
      Deno.env.get(
        "POOL_DEVICE_SECRET"
      );

    if (
      !expectedSecret ||
      receivedSecret !== expectedSecret
    ) {
      return jsonResponse(
        {
          error:
            "Unauthorized device",
        },
        401,
      );
    }


    // ---------------------------------------
    // REQUEST BODY
    // ---------------------------------------

    const body =
      await request.json();

    const allowedStatuses = [
      "Low",
      "Normal",
      "High",
      "Error",
    ];

    if (
      !allowedStatuses.includes(
        body.status
      )
    ) {
      return jsonResponse(
        {
          error:
            "Invalid status",
        },
        400,
      );
    }


    // ---------------------------------------
    // SUPABASE ADMIN CLIENT
    // ---------------------------------------

    const supabaseAdmin =
      createClient(
        Deno.env.get(
          "SUPABASE_URL"
        )!,

        Deno.env.get(
          "SUPABASE_SERVICE_ROLE_KEY"
        )!,

        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        },
      );


    // ---------------------------------------
    // LOAD CURRENT SWIMMING MODE
    // ---------------------------------------

    const {
      data: poolControl,
      error: poolControlError,
    } =
      await supabaseAdmin
        .from("pool_control")
        .select(
          "swimming_mode_until, swimming_mode_source"
        )
        .eq("id", 1)
        .maybeSingle();

    if (poolControlError) {
      console.error(
        "Could not load pool control:",
        poolControlError,
      );
    }


    let swimmingModeActive =
      false;

    let swimmingModeSource:
      string | null =
        poolControl
          ?.swimming_mode_source ??
        null;


    if (
      poolControl
        ?.swimming_mode_until
    ) {
      const swimmingUntil =
        new Date(
          poolControl
            .swimming_mode_until
        ).getTime();

      swimmingModeActive =
        swimmingUntil >
        Date.now();
    }


    console.log(
      "Swimming mode:",
      swimmingModeActive
        ? `ACTIVE (${swimmingModeSource})`
        : "OFF"
    );


    // ---------------------------------------
    // LOAD PREVIOUS STATUS
    // ---------------------------------------

    const {
      data: previousStatus,
      error: previousStatusError,
    } =
      await supabaseAdmin
        .from("pool_status")
        .select(
          "status, fertilizer_available"
        )
        .order(
          "created_at",
          {
            ascending: false,
          }
        )
        .limit(1)
        .maybeSingle();


    if (previousStatusError) {
      console.error(
        "Could not load previous status:",
        previousStatusError,
      );
    }


    // ---------------------------------------
    // FERTILIZER VALUE
    // ---------------------------------------

    const fertilizerAvailable =
      typeof
        body.fertilizer_available ===
        "boolean"
        ? body.fertilizer_available
        : null;


    // ---------------------------------------
    // SAVE NEW READING
    // ---------------------------------------

    const {
      error: insertError
    } =
      await supabaseAdmin
        .from("pool_status")
        .insert({
          status:
            body.status,

          temperature:
            typeof body.temperature ===
            "number"
              ? body.temperature
              : null,

          fertilizer_available:
            fertilizerAvailable,

          wifi_signal:
            typeof body.wifi_signal ===
            "number"
              ? body.wifi_signal
              : null,

          device_online:
            true,
        });


    if (insertError) {
      console.error(
        insertError
      );

      return jsonResponse(
        {
          error:
            insertError.message,
        },
        500,
      );
    }


    // ---------------------------------------
    // AUTOMATIC SWIMMING DETECTION
    // ---------------------------------------
    //
    // Only run detection when Swimming Mode
    // is currently OFF.
    //
    // Looks at the last 5 minutes and counts
    // real transitions between:
    // Low / Normal / High
    //
    // Error does not count.
    // Duplicate readings do not count.
    // ---------------------------------------

    let automaticSwimmingDetected =
      false;

    let detectedTransitions =
      0;


    if (!swimmingModeActive) {

      const windowStart =
        new Date(
          Date.now() -
          AUTO_SWIM_WINDOW_MINUTES *
          60 *
          1000
        );


      const {
        data: recentStatuses,
        error: recentStatusesError,
      } =
        await supabaseAdmin
          .from("pool_status")
          .select(
            "status, created_at"
          )
          .gte(
            "created_at",
            windowStart.toISOString()
          )
          .order(
            "created_at",
            {
              ascending: true,
            }
          );


      if (recentStatusesError) {

        console.error(
          "Could not load recent statuses:",
          recentStatusesError,
        );

      } else {

        detectedTransitions =
          countWaterTransitions(
            recentStatuses ?? []
          );


        console.log(
          `Water transitions in last ${AUTO_SWIM_WINDOW_MINUTES} minutes:`,
          detectedTransitions
        );


        if (
          detectedTransitions >=
          AUTO_SWIM_REQUIRED_CHANGES
        ) {

          const swimmingUntil =
            new Date(
              Date.now() +
              SWIMMING_MODE_DURATION_MINUTES *
              60 *
              1000
            );


          const {
            error:
              swimmingUpdateError,
          } =
            await supabaseAdmin
              .from("pool_control")
              .update({
                swimming_mode_until:
                  swimmingUntil
                    .toISOString(),

                swimming_mode_source:
                  "automatic",
              })
              .eq("id", 1);


          if (
            swimmingUpdateError
          ) {

            console.error(
              "Could not activate automatic Swimming Mode:",
              swimmingUpdateError,
            );

          } else {

            swimmingModeActive =
              true;

            swimmingModeSource =
              "automatic";

            automaticSwimmingDetected =
              true;


            console.log(
              "Automatic Swimming Mode activated until:",
              swimmingUntil.toISOString()
            );
          }
        }
      }
    }


    // ---------------------------------------
    // WATER STATUS CHANGE
    // ---------------------------------------

    const waterStatusChanged =
      previousStatus &&
      previousStatus.status !==
        body.status;


    // ---------------------------------------
    // LOW ALERT
    // ---------------------------------------

    if (
      waterStatusChanged &&
      body.status === "Low"
    ) {

      if (
        swimmingModeActive
      ) {

        console.log(
          "LOW push suppressed because Swimming Mode is active"
        );

      } else {

        await sendPush(
          "Pool Guardian",
          "⚠️ Pool water level is LOW",
          "LOW",
        );
      }
    }


    // ---------------------------------------
    // HIGH ALERT
    // ---------------------------------------

    if (
      waterStatusChanged &&
      body.status === "High"
    ) {

      if (
        swimmingModeActive
      ) {

        console.log(
          "HIGH push suppressed because Swimming Mode is active"
        );

      } else {

        await sendPush(
          "Pool Guardian",
          "⚠️ Pool water level is HIGH",
          "HIGH",
        );
      }
    }


    // ---------------------------------------
    // ERROR ALERT
    //
    // NEVER suppressed by Swimming Mode
    // ---------------------------------------

    if (
      waterStatusChanged &&
      body.status === "Error"
    ) {

      await sendPush(
        "Pool Guardian",
        "⚠️ Water level sensors report an invalid state",
        "ERROR",
      );
    }


    // ---------------------------------------
    // FERTILIZER ALERT
    //
    // NEVER suppressed by Swimming Mode
    // ---------------------------------------

    const fertilizerBecameLow =
      previousStatus &&
      previousStatus
        .fertilizer_available ===
        true &&
      fertilizerAvailable ===
        false;


    if (
      fertilizerBecameLow
    ) {

      await sendPush(
        "Pool Guardian",
        "🧴 Fertilizer level is LOW — refill required",
        "FERTILIZER_LOW",
      );
    }


    // ---------------------------------------
    // RESPONSE
    // ---------------------------------------

    return jsonResponse(
      {
        success: true,

        swimming_mode_active:
          swimmingModeActive,

        swimming_mode_source:
          swimmingModeSource,

        automatic_swimming_detected:
          automaticSwimmingDetected,

        transitions_last_5_minutes:
          detectedTransitions,
      },
      201,
    );


  } catch (error) {

    console.error(
      error
    );


    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown error",
      },
      500,
    );
  }
});
