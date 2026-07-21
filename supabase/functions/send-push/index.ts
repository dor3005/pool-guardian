import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

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

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return jsonResponse(
      { error: "Method not allowed" },
      405,
    );
  }

  const expectedSecret =
    Deno.env.get("PUSH_ADMIN_SECRET");

  const receivedSecret =
    request.headers.get("x-push-secret");

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
    const vapidPublicKey =
      Deno.env.get("VAPID_PUBLIC_KEY");

    const vapidPrivateKey =
      Deno.env.get("VAPID_PRIVATE_KEY");

    const vapidSubject =
      Deno.env.get("VAPID_SUBJECT");

    if (
      !vapidPublicKey ||
      !vapidPrivateKey ||
      !vapidSubject
    ) {
      return jsonResponse(
        { error: "VAPID configuration missing" },
        500,
      );
    }

    const requestBody = await request.json();

    const title =
      typeof requestBody.title === "string"
        ? requestBody.title
        : "Pool Guardian";

    const body =
      typeof requestBody.body === "string"
        ? requestBody.body
        : "Pool status requires attention";

    const status =
      typeof requestBody.status === "string"
        ? requestBody.status.toUpperCase()
        : "ALERT";

    webpush.setVapidDetails(
      vapidSubject,
      vapidPublicKey,
      vapidPrivateKey,
    );

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

    const { data: subscriptions, error } =
      await supabase
        .from("push_subscriptions")
        .select("id, subscription")
        .eq("active", true);

    if (error) {
      console.error(error);

      return jsonResponse(
        { error: "Could not load subscriptions" },
        500,
      );
    }

    const payload = JSON.stringify({
      title,
      body,
      status,
      url: "./index.html",
    });

    let sent = 0;
    let failed = 0;
    let deactivated = 0;

    for (const record of subscriptions ?? []) {
      try {
        await webpush.sendNotification(
          record.subscription,
          payload,
          {
            TTL: 60,
            urgency: "high",
          },
        );

        sent += 1;
      } catch (error) {
        failed += 1;

        const statusCode =
          typeof error === "object" &&
          error !== null &&
          "statusCode" in error
            ? Number(error.statusCode)
            : 0;

        console.error(
          "Push delivery failed:",
          statusCode,
        );

        if (
          statusCode === 404 ||
          statusCode === 410
        ) {
          await supabase
            .from("push_subscriptions")
            .update({
              active: false,
              updated_at:
                new Date().toISOString(),
            })
            .eq("id", record.id);

          deactivated += 1;
        }
      }
    }

    return jsonResponse({
      success: true,
      total: subscriptions?.length ?? 0,
      sent,
      failed,
      deactivated,
    });
  } catch (error) {
    console.error(error);

    return jsonResponse(
      { error: "Unexpected server error" },
      500,
    );
  }
});