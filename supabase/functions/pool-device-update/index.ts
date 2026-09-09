import { createClient } from "jsr:@supabase/supabase-js@2";

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


Deno.serve(async (request) => {

  try {

    if (request.method !== "POST") {

      return jsonResponse(
        {
          error:
            "Method not allowed"
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
            "Unauthorized device"
        },
        401,
      );
    }


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
            "Invalid status"
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
    // LOAD SWIMMING MODE
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
        ? "ACTIVE"
        : "OFF"
    );


    // ---------------------------------------
    // LOAD PREVIOUS POOL STATUS
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
    // FERTILIZER
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
            insertError.message
        },
        500,
      );
    }


    // ---------------------------------------
    // WATER STATUS CHANGE
    // ---------------------------------------

    const waterStatusChanged =
      previousStatus &&
      previousStatus.status !==
        body.status;


    // LOW
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


    // HIGH
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


    // ERROR IS NEVER MUTED
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


    return jsonResponse(
      {
        success: true,
        swimming_mode_active:
          swimmingModeActive,
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
