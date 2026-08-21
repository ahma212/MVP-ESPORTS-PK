import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import webpush from "npm:web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT =
  Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com";

const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL")!;

webpush.setVapidDetails(
  VAPID_SUBJECT,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers,
  });
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers,
    });
  }

  // Only POST allowed
  if (req.method !== "POST") {
    return jsonResponse(
      { error: "Only POST requests are allowed" },
      405
    );
  }

  try {
    // -----------------------------------------
    // 1. Check Authorization
    // -----------------------------------------

    const authHeader = req.headers.get("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return jsonResponse(
        { error: "Authentication required" },
        401
      );
    }

    const token = authHeader.replace("Bearer ", "").trim();

    // Client used only to verify the logged-in user
    const userClient = createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return jsonResponse(
        { error: "Invalid or expired login session" },
        401
      );
    }

    // -----------------------------------------
    // 2. Admin verification
    // -----------------------------------------

    if (!user.email || user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
      return jsonResponse(
        { error: "Admin access required" },
        403
      );
    }

    // -----------------------------------------
    // 3. Read notification data
    // -----------------------------------------

    const { user_id, title, body, url } = await req.json();

    if (!user_id || !title || !body) {
      return jsonResponse(
        {
          error:
            "user_id, title and body are required",
        },
        400
      );
    }

    // -----------------------------------------
    // 4. Server-side Supabase client
    // -----------------------------------------

    const supabase = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY
    );

    // -----------------------------------------
    // 5. Get user's push subscriptions
    // -----------------------------------------

    const {
      data: subscriptions,
      error: subscriptionError,
    } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", user_id);

    if (subscriptionError) {
      console.error(
        "Subscription lookup error:",
        subscriptionError
      );

      return jsonResponse(
        {
          error: "Unable to find push subscription",
        },
        500
      );
    }

    if (!subscriptions || subscriptions.length === 0) {
      return jsonResponse(
        {
          error:
            "This user has no active push subscription",
        },
        404
      );
    }

    // -----------------------------------------
    // 6. Send notification
    // -----------------------------------------

    const results = [];

    for (const sub of subscriptions) {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };

      try {
        await webpush.sendNotification(
          pushSubscription,
          JSON.stringify({
            title: title,
            body: body,
            url: url || "/",
          })
        );

        results.push({
          endpoint: sub.endpoint,
          success: true,
        });
      } catch (error: any) {
        console.error(
          "Push notification error:",
          error
        );

        results.push({
          endpoint: sub.endpoint,
          success: false,
          error: error?.message || "Push failed",
          statusCode: error?.statusCode || null,
        });

        // -----------------------------------------
        // 7. Remove expired subscriptions
        // -----------------------------------------

        if (
          error?.statusCode === 404 ||
          error?.statusCode === 410
        ) {
          await supabase
            .from("push_subscriptions")
            .delete()
            .eq("endpoint", sub.endpoint);
        }
      }
    }

    // -----------------------------------------
    // 8. Final response
    // -----------------------------------------

    const successful = results.filter(
      (item) => item.success
    ).length;

    const failed = results.filter(
      (item) => !item.success
    ).length;

    return jsonResponse({
      success: successful > 0,
      message:
        successful > 0
          ? "Notification sent successfully"
          : "Notification could not be delivered",
      total_subscriptions: results.length,
      successful,
      failed,
      results,
    });
  } catch (error: any) {
    console.error("send-push error:", error);

    return jsonResponse(
      {
        error:
          error?.message ||
          "Internal server error",
      },
      500
    );
  }
});