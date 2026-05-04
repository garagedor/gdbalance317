// Force-open weekly reports for ALL active technicians and area managers.
// Bypasses the time gate. Uses current Indiana Monday->Sunday week.
// Returns success count + failure list with per-user reasons.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Failure = {
  user_id: string;
  full_name: string | null;
  reason: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startedAt = new Date().toISOString();
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Verify caller is management
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return json({ ok: false, error: "Missing auth" }, 401);
    }
    const { data: meRes, error: getUserErr } = await admin.auth.getUser(token);
    const me = meRes?.user;
    if (getUserErr || !me) {
      console.error("[force-open-all-reports] getUser failed", getUserErr);
      return json({ ok: false, error: "Session expired — sign out and sign in again" }, 401);
    }

    const { data: meRow, error: meErr } = await admin
      .from("users")
      .select("role, is_active")
      .eq("id", me.id)
      .maybeSingle();
    if (meErr) return json({ ok: false, error: meErr.message }, 500);
    if (!meRow || meRow.role !== "management" || !meRow.is_active) {
      return json({ ok: false, error: "Only management can force-open" }, 403);
    }

    // Parse optional body: { week_start?, technician_ids?[] }
    let bodyWeekStart: string | null = null;
    let technicianIds: string[] | null = null;
    if (req.method === "POST") {
      try {
        const b = await req.json();
        if (b?.week_start && typeof b.week_start === "string") bodyWeekStart = b.week_start;
        if (Array.isArray(b?.technician_ids) && b.technician_ids.length > 0) {
          technicianIds = b.technician_ids.filter((x: any) => typeof x === "string");
        }
      } catch { /* empty body OK */ }
    }

    // Resolve week
    let week_start: string;
    let week_end: string;
    let opens_at: string;
    if (bodyWeekStart) {
      // Normalize to Monday of that ISO week
      const d = new Date(bodyWeekStart + "T00:00:00Z");
      if (isNaN(d.getTime())) return json({ ok: false, error: "Invalid week_start" }, 400);
      const dow = d.getUTCDay(); // 0 Sun..6 Sat
      const diff = dow === 0 ? -6 : 1 - dow;
      d.setUTCDate(d.getUTCDate() + diff);
      const monday = d.toISOString().slice(0, 10);
      const sun = new Date(d);
      sun.setUTCDate(sun.getUTCDate() + 6);
      week_start = monday;
      week_end = sun.toISOString().slice(0, 10);
      opens_at = new Date().toISOString();
    } else {
      const { data: weekRows, error: weekErr } = await admin.rpc("indiana_current_week");
      if (weekErr) return json({ ok: false, error: weekErr.message }, 500);
      const week = Array.isArray(weekRows) ? weekRows[0] : weekRows;
      if (!week) return json({ ok: false, error: "Could not resolve week" }, 500);
      week_start = week.week_start;
      week_end = week.week_end;
      opens_at = week.opens_at;
    }

    console.log("[force-open-all-reports] params", {
      week_start, week_end, by: me.id, technicianIds: technicianIds?.length ?? "ALL",
    });

    // Pull users (filter by ids if given)
    let usersQ = admin
      .from("users")
      .select("id, full_name, role, is_active, area_id, archived_at, pending_approval, commission_rate");
    if (technicianIds) usersQ = usersQ.in("id", technicianIds);
    const { data: allUsers, error: usersErr } = await usersQ;
    if (usersErr) return json({ ok: false, error: usersErr.message }, 500);

    const failures: Failure[] = [];
    const eligible: { id: string; area_id: string; commission_rate: number; full_name: string | null }[] = [];

    for (const u of allUsers ?? []) {
      if (u.archived_at) {
        if (technicianIds) failures.push({ user_id: u.id, full_name: u.full_name, reason: "archived" });
        continue;
      }
      const role = u.role;
      if (role !== "technician" && role !== "area_manager") {
        if (technicianIds) failures.push({ user_id: u.id, full_name: u.full_name, reason: `role=${role}` });
        continue;
      }
      if (!u.is_active) { failures.push({ user_id: u.id, full_name: u.full_name, reason: "inactive" }); continue; }
      if (u.pending_approval) { failures.push({ user_id: u.id, full_name: u.full_name, reason: "pending approval" }); continue; }
      if (!u.area_id) { failures.push({ user_id: u.id, full_name: u.full_name, reason: "missing area" }); continue; }
      eligible.push({
        id: u.id,
        area_id: u.area_id,
        commission_rate: Number(u.commission_rate ?? 0.30),
        full_name: u.full_name,
      });
    }

    // Find existing reports for this week so we don't duplicate
    const { data: existing, error: existErr } = await admin
      .from("weekly_reports")
      .select("technician_id")
      .eq("week_start", week_start);
    if (existErr) return json({ ok: false, error: existErr.message }, 500);
    const have = new Set((existing ?? []).map((r: any) => r.technician_id));

    const toInsert = eligible
      .filter((e) => !have.has(e.id))
      .map((e) => ({
        technician_id: e.id,
        area_id: e.area_id,
        week_start,
        week_end,
        opens_at,
        status: "Draft",
        commission_rate: e.commission_rate,
      }));

    let createdRows: any[] = [];
    if (toInsert.length > 0) {
      const { data: ins, error: insErr } = await admin
        .from("weekly_reports")
        .insert(toInsert)
        .select("id, technician_id, week_start, week_end");
      if (insErr) {
        console.error("[force-open-all-reports] insert error", insErr);
        return json({ ok: false, error: insErr.message }, 500);
      }
      createdRows = ins ?? [];
    }

    const skippedExisting = eligible.length - toInsert.length;
    console.log("[force-open-all-reports] result", {
      created: createdRows.length,
      skippedExisting,
      failures: failures.length,
    });

    return json({
      ok: true,
      week_start,
      week_end,
      created: createdRows.length,
      already_open: skippedExisting,
      total_eligible: eligible.length,
      failures,
      ranAt: startedAt,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[force-open-all-reports] Unexpected error:", msg);
    return json({ ok: false, error: msg, ranAt: startedAt }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
