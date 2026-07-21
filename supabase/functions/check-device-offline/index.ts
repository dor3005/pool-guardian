import { createClient } from "jsr:@supabase/supabase-js@2";

const OFFLINE_AFTER_MS = 3 * 60 * 1000;

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

async function sendOfflinePush() {
  const supabaseUrl =
    Deno.env.get("SUPABASE_URL");

  const pushSecret =
    Deno.env.get("PUSH_ADMIN_SECRET");

  if (!supabaseUrl || !pushSecret) {
    console.error("Push configuration missing");
    return false;
  }

  const response = await fetch(
    `${supabaseUrl}/functions/v1/send-push`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-push-secret": pushSecret,
      },
      body: JSON.stringify({
        title: "Pool Guardian",
        body:
          "📡 Pool Guardian device is OFFLINE",
        status: "OFFLINE",
      }),
    },
  );

  if (!response.ok) {
    console.error(
      "Offline Push failed:",
      response.status,
      await response.text(),
    );

    return false;
  }

  return true;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return jsonResponse(
      { error: "Method not allowed" },
      405,
    );
  }

  const expectedSecret =
    Deno.env.get("OFFLINE_CHECK_SECRET");

  const receivedSecret =
    request.headers.get("x-cron-secret");

  if (
    !expectedSecret ||
    receivedSecret !== expectedSecret
  ) {
    return jsonResponse(
      { error: "Unauthorized" },
      401,
    );
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
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

    const {
      data: lastOnline,
      error: lastOnlineError,
    } = await supabase
      .from("pool_status")
      .select(
        "status, temperature, fertilizer_available, wifi_signal, created_at"
      )
      .eq("device_online", true)
      .order("created_at", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

    if (lastOnlineError) {
      console.error(lastOnlineError);

      return jsonResponse(
        { error: "Could not read last update" },
        500,
      );
    }

    if (!lastOnline) {
      return jsonResponse({
        success: true,
        state: "NO_DATA",
      });
    }

    const {
      data: latestStatus,
      error: latestStatusError,
    } = await supabase
      .from("pool_status")
      .select("device_online")
      .order("created_at", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

    if (latestStatusError) {
      console.error(latestStatusError);

      return jsonResponse(
        { error: "Could not read device state" },
        500,
      );
    }

    const millisecondsSinceUpdate =
      Date.now() -
      new Date(
        lastOnline.created_at
      ).getTime();

    if (
      millisecondsSinceUpdate <=
      OFFLINE_AFTER_MS
    ) {
      return jsonResponse({
        success: true,
        state: "ONLINE",
        secondsSinceUpdate: Math.floor(
          millisecondsSinceUpdate / 1000
        ),
      });
    }

    if (
      latestStatus?.device_online === false
    ) {
      return jsonResponse({
        success: true,
        state: "ALREADY_OFFLINE",
      });
    }

    const { error: insertError } =
      await supabase
        .from("pool_status")
        .insert({
          status: lastOnline.status,
          temperature:
            lastOnline.temperature,
          fertilizer_available:
            lastOnline.fertilizer_available,
          wifi_signal:
            lastOnline.wifi_signal,
          device_online: false,
        });

    if (insertError) {
      console.error(insertError);

      return jsonResponse(
        { error: "Could not save Offline state" },
        500,
      );
    }

    const pushSent =
      await sendOfflinePush();

    return jsonResponse({
      success: true,
      state: "OFFLINE",
      pushSent,
    });
  } catch (error) {
    console.error(error);

    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected server error",
      },
      500,
    );
  }
});