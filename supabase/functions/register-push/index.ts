import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://dor3005.github.io",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
]);

function getCorsHeaders(request: Request) {
  const origin = request.headers.get("origin") ?? "";

  return {
    "Access-Control-Allow-Origin":
      allowedOrigins.has(origin)
        ? origin
        : "https://dor3005.github.io",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods":
      "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function jsonResponse(
  request: Request,
  body: Record<string, unknown>,
  status = 200,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(request),
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: getCorsHeaders(request),
    });
  }

  if (request.method !== "POST") {
    return jsonResponse(
      request,
      { error: "Method not allowed" },
      405,
    );
  }

  const origin = request.headers.get("origin") ?? "";

  if (!allowedOrigins.has(origin)) {
    return jsonResponse(
      request,
      { error: "Origin not allowed" },
      403,
    );
  }

  try {
    const body = await request.json();
    const subscription = body.subscription;

    if (
      !subscription ||
      typeof subscription.endpoint !== "string" ||
      typeof subscription.keys?.p256dh !== "string" ||
      typeof subscription.keys?.auth !== "string"
    ) {
      return jsonResponse(
        request,
        { error: "Invalid push subscription" },
        400,
      );
    }

    const endpointUrl = new URL(
      subscription.endpoint,
    );

    const allowedPushHosts = new Set([
      "fcm.googleapis.com",
      "updates.push.services.mozilla.com",
      "web.push.apple.com",
    ]);

    if (
      endpointUrl.protocol !== "https:" ||
      !allowedPushHosts.has(endpointUrl.hostname)
    ) {
      return jsonResponse(
        request,
        { error: "Unsupported push provider" },
        400,
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    const { error } = await supabase
      .from("push_subscriptions")
      .upsert(
        {
          endpoint: subscription.endpoint,
          subscription,
          user_agent:
            request.headers.get("user-agent"),
          active: true,
          updated_at:
            new Date().toISOString(),
        },
        {
          onConflict: "endpoint",
        },
      );

    if (error) {
      console.error(error);

      return jsonResponse(
        request,
        { error: "Could not save subscription" },
        500,
      );
    }

    return jsonResponse(request, {
      success: true,
    });
  } catch (error) {
    console.error(error);

    return jsonResponse(
      request,
      { error: "Unexpected server error" },
      500,
    );
  }
});