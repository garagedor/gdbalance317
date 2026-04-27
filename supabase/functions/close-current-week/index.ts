// Close the current Indiana weekly cycle by inserting a row in week_locks.
// Management-only. Idempotent (no error if already locked).

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

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userRes } = await userClient.auth.getUser();
    const caller = userRes?.user;
    if (!caller) {
      return json({ ok: false, error: "Not authenticated" }, 401);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: callerRow, error: roleErr } = await admin
      .from("users")
      .select("role, is_active")
      .eq("id", caller.id)
      .maybeSingle();
    if (roleErr) throw roleErr;
    if (!callerRow || callerRow.role !== "management" || !callerRow.is_active) {
      return json({ ok: false, error: "Only management can close the week" }, 403);
    }

    let body: { week_start?: string; note?: string } = {};
    try {
      body = (await req.json()) ?? {};
    } catch {
      // empty body OK
    }

    let weekStart = body.week_start;
    if (!weekStart) {
      const { data: wk, error: wkErr } = await admin.rpc("indiana_current_week");
      if (wkErr) throw wkErr;
      const row = Array.isArray(wk) ? wk[0] : wk;
      weekStart = row?.week_start;
    }
    if (!weekStart) {
      return json({ ok: false, error: "Could not determine current week" }, 500);
    }

    const { data: existing } = await admin
      .from("week_locks")
      .select("week_start, locked_at, locked_by")
      .eq("week_start", weekStart)
      .maybeSingle();

    if (existing) {
      return json({ ok: true, already_locked: true, week_start: weekStart });
    }

    const { error: insErr } = await admin
      .from("week_locks")
      .insert({ week_start: weekStart, locked_by: caller.id, note: body.note ?? null });
    if (insErr) throw insErr;

    return json({ ok: true, already_locked: false, week_start: weekStart });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[close-current-week] error", msg);
    return json({ ok: false, error: msg }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
