// Admin-only: reset a technician's PIN.
// Verifies the caller is management, then updates the auth password
// for the synthetic email tied to that technician's phone.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function digitsOnly(s: string) {
  return (s ?? "").replace(/\D/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const user_id = String(body.user_id ?? "").trim();
    const new_pin = String(body.new_pin ?? "").trim();
    if (!user_id) return json({ error: "user_id required" }, 400);
    if (!/^\d{4}$/.test(new_pin)) {
      return json({ error: "PIN must be exactly 4 digits." }, 400);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify the caller is management using the caller's JWT.
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: who } = await callerClient.auth.getUser();
    if (!who.user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: callerProfile } = await admin
      .from("users")
      .select("role, is_active")
      .eq("id", who.user.id)
      .maybeSingle();
    if (callerProfile?.role !== "management" || !callerProfile.is_active) {
      return json({ error: "Only management can reset PINs" }, 403);
    }

    // Look up target user
    const { data: target, error: targetErr } = await admin
      .from("users")
      .select("id, phone")
      .eq("id", user_id)
      .maybeSingle();
    if (targetErr || !target) return json({ error: "User not found" }, 404);
    const phone = digitsOnly(target.phone ?? "");
    if (!phone) {
      return json({ error: "This user has no phone on file." }, 400);
    }

    const newPassword = `tech-${new_pin}-${phone}`;
    const { error: upErr } = await admin.auth.admin.updateUserById(user_id, {
      password: newPassword,
    });
    if (upErr) return json({ error: upErr.message }, 500);

    return json({ ok: true }, 200);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
