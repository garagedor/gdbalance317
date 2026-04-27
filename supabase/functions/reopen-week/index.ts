// Reopen a previously closed week by deleting its row in week_locks.
// Management-only.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const caller = userRes?.user;
    if (!caller) return json({ ok: false, error: "Not authenticated" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: callerRow } = await admin
      .from("users")
      .select("role, is_active")
      .eq("id", caller.id)
      .maybeSingle();
    if (!callerRow || callerRow.role !== "management" || !callerRow.is_active) {
      return json({ ok: false, error: "Only management can reopen a week" }, 403);
    }

    let body: { week_start?: string } = {};
    try { body = (await req.json()) ?? {}; } catch { /* empty */ }

    let weekStart = body.week_start;
    if (!weekStart) {
      const { data: wk } = await admin.rpc("indiana_current_week");
      const row = Array.isArray(wk) ? wk[0] : wk;
      weekStart = row?.week_start;
    }
    if (!weekStart) return json({ ok: false, error: "Missing week_start" }, 400);

    const { error: delErr } = await admin
      .from("week_locks")
      .delete()
      .eq("week_start", weekStart);
    if (delErr) throw delErr;

    return json({ ok: true, week_start: weekStart });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[reopen-week] error", msg);
    return json({ ok: false, error: msg }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
