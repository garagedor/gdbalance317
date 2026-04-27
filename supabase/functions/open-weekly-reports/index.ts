// Weekly opener edge function.
// Invoked by pg_cron every Sunday 21:30 local (per area), or manually by an admin.
// Calls the SECURITY DEFINER RPC `open_weekly_reports_for_previous_week`
// using the service role so it can bypass RLS for the bulk insert.

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

  const startedAt = new Date().toISOString();
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    console.log("[open-weekly-reports] invoke", {
      startedAt,
      method: req.method,
    });

    // Snapshot of the gate inputs so we can debug "did not open" reports.
    const { data: candidates, error: candErr } = await admin.rpc(
      "open_weekly_reports_for_previous_week",
    );

    if (candErr) {
      console.error("[open-weekly-reports] RPC error:", candErr);
      return new Response(
        JSON.stringify({ ok: false, error: candErr.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const created = Array.isArray(candidates) ? candidates.length : 0;
    console.log(
      `[open-weekly-reports] Created ${created} report(s) at ${startedAt}`,
      Array.isArray(candidates)
        ? candidates.map((c: any) => ({
            technician_id: c.technician_id,
            week_start: c.week_start,
            week_end: c.week_end,
          }))
        : null,
    );

    return new Response(
      JSON.stringify({
        ok: true,
        created,
        reports: candidates ?? [],
        ranAt: startedAt,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[open-weekly-reports] Unexpected error:", msg);
    return new Response(
      JSON.stringify({ ok: false, error: msg, ranAt: startedAt }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
