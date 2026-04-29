// Send pending push notifications via Web Push (VAPID).
// Pulls a batch from public.push_outbox, fans out to every active
// push_subscriptions row for the recipient, deletes dead endpoints (404/410).
//
// Uses npm: specifier for web-push (better Node compat in Supabase Edge
// Runtime than esm.sh, which hit Deno.core.runMicrotasks errors).
import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@317garagedoor.com";

const VAPID_OK = !!VAPID_PUBLIC && !!VAPID_PRIVATE;
if (VAPID_OK) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  } catch (e) {
    console.error("VAPID configuration failed", e);
  }
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface OutboxRow {
  id: string;
  user_id: string;
  title: string;
  body: string;
  link: string | null;
  event_type: string;
}

async function getCallerUserId(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization");
  if (!auth) return null;
  const token = auth.replace(/^Bearer\s+/i, "");
  const { data } = await admin.auth.getUser(token);
  return data.user?.id ?? null;
}

async function deliver(rows: OutboxRow[]) {
  let delivered = 0;
  let removed = 0;
  let failed = 0;

  const byUser = new Map<string, OutboxRow[]>();
  for (const r of rows) {
    const arr = byUser.get(r.user_id) ?? [];
    arr.push(r);
    byUser.set(r.user_id, arr);
  }

  for (const [userId, items] of byUser) {
    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", userId);
    if (!subs || subs.length === 0) continue;

    for (const item of items) {
      const payload = JSON.stringify({
        title: item.title,
        body: item.body,
        link: item.link ?? "/",
        event_type: item.event_type,
        tag: item.event_type,
      });

      for (const s of subs) {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
            { TTL: 60 * 60 * 24 }
          );
          delivered++;
        } catch (err: unknown) {
          const e = err as { statusCode?: number; body?: string; message?: string };
          if (e?.statusCode === 404 || e?.statusCode === 410) {
            await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
            removed++;
          } else {
            failed++;
            console.error("push send failed", e?.statusCode, e?.message);
          }
        }
      }
    }
  }
  return { delivered, removed, failed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    let body: { test?: boolean } = {};
    if (req.method === "POST") {
      try {
        body = await req.json();
      } catch {
        body = {};
      }
    }

    if (!VAPID_OK) {
      return new Response(
        JSON.stringify({ ok: false, code: "vapid_missing", error: "Push setup missing VAPID keys" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Test mode: send a test push only to the caller
    if (body.test === true) {
      const uid = await getCallerUserId(req);
      if (!uid) {
        return new Response(
          JSON.stringify({ ok: false, code: "unauthenticated", error: "Not authenticated" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { count } = await admin
        .from("push_subscriptions")
        .select("endpoint", { count: "exact", head: true })
        .eq("user_id", uid);

      if (!count || count === 0) {
        return new Response(
          JSON.stringify({ ok: false, code: "no_subscription", error: "No push subscription found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await admin.from("push_outbox").insert({
        user_id: uid,
        title: "Test notification",
        body: "Push notifications are working on this device.",
        link: "/",
        event_type: "report_opened",
      });
    }

    const { data: rows, error } = await admin.rpc("claim_pending_push_batch", {
      _limit: 100,
    });
    if (error) throw error;

    const stats = rows && rows.length > 0
      ? await deliver(rows as OutboxRow[])
      : { delivered: 0, removed: 0, failed: 0 };

    return new Response(
      JSON.stringify({ ok: true, claimed: rows?.length ?? 0, ...stats }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("send-push error", msg);
    return new Response(
      JSON.stringify({ ok: false, code: "internal_error", error: "Failed to send notification" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
