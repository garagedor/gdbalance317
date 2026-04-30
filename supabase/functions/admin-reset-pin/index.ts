// Admin-only: reset a technician's PIN.
// Verifies the caller is management, then updates the Supabase Auth password
// that tech-login uses for phone + PIN sign-in.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function digitsOnly(s: string) {
  return (s ?? "").replace(/\D/g, "");
}

function normalizePhone(s: string) {
  const d = digitsOnly(s);
  return d.length >= 10 ? d.slice(-10) : d;
}

function syntheticEmail(phoneDigits: string) {
  return `tech+${phoneDigits}@phone.317gd.local`;
}

function safeError(error: string, code: string, status = 200, debug: Record<string, unknown> = {}) {
  return json({ ok: false, error, code, debug }, status);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return safeError("Missing permissions", "unauthorized", 200);

    const body = await req.json().catch(() => ({}));
    const user_id = String(body.user_id ?? "").trim();
    const new_pin = String(body.new_pin ?? "").trim();
    if (!user_id) return safeError("User not found", "user_id_required");
    if (!/^\d{4}$/.test(new_pin)) {
      return safeError("PIN must be exactly 4 digits.", "pin_invalid");
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
      console.error("admin-reset-pin: missing env vars", {
        hasUrl: !!SUPABASE_URL,
        hasAnon: !!ANON_KEY,
        hasService: !!SERVICE_KEY,
        user_id,
      });
      return safeError("Failed to update PIN", "config", 200, { user_id, pin_updated: false });
    }

    // Verify the caller is management using the caller's JWT.
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: who, error: whoErr } = await callerClient.auth.getUser();
    if (whoErr || !who.user) {
      console.warn("admin-reset-pin: unauthorized caller", { user_id, message: whoErr?.message });
      return safeError("Missing permissions", "unauthorized", 200, { user_id, pin_updated: false });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: callerProfile } = await admin
      .from("users")
      .select("role, is_active")
      .eq("id", who.user.id)
      .maybeSingle();
    if (callerProfile?.role !== "management" || !callerProfile.is_active) {
      console.warn("admin-reset-pin: forbidden caller", { caller_id: who.user.id, user_id });
      return safeError("Missing permissions", "forbidden", 200, { user_id, pin_updated: false });
    }

    // Look up target user
    const { data: target, error: targetErr } = await admin
      .from("users")
      .select("id, full_name, email, phone, role, archived_at")
      .eq("id", user_id)
      .maybeSingle();
    if (targetErr) {
      console.error("admin-reset-pin: target lookup failed", { user_id, message: targetErr.message });
      return safeError("Failed to update PIN", "target_lookup_failed", 200, { user_id, pin_updated: false });
    }
    if (!target || target.archived_at) {
      return safeError("User not found", "user_not_found", 200, {
        user_id,
        credential_exists: false,
        pin_updated: false,
      });
    }
    const phone = normalizePhone(target.phone ?? "");
    if (phone.length !== 10) {
      return safeError("User not found", "phone_missing", 200, {
        user_id,
        phone: target.phone ?? null,
        credential_exists: false,
        pin_updated: false,
      });
    }

    const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(user_id);
    let credentialExists = !!authUser?.user && !authErr;
    if (authErr || !authUser?.user) {
      console.warn("admin-reset-pin: credential missing; recreating", { user_id, phone, message: authErr?.message });
      const createEmail = (target as { email?: string | null }).email || syntheticEmail(phone);
      const { error: createErr } = await admin.auth.admin.createUser({
        id: user_id,
        email: createEmail,
        password: `tech-${new_pin}-${phone}`,
        email_confirm: true,
        user_metadata: { phone, full_name: (target as { full_name?: string | null }).full_name ?? undefined },
      });
      if (createErr) {
        console.error("admin-reset-pin: credential recreate failed", { user_id, phone, message: createErr.message });
        return safeError("User not found", "credential_missing", 200, {
          user_id,
          phone,
          credential_exists: false,
          pin_updated: false,
        });
      }
      credentialExists = true;
      console.log("admin-reset-pin: credential recreated and PIN updated", { user_id, phone });
      return json({
        ok: true,
        message: "PIN updated successfully",
        debug: { user_id, phone, credential_exists: true, pin_updated: true },
      }, 200);
    }

    const newPassword = `tech-${new_pin}-${phone}`;
    const { error: upErr } = await admin.auth.admin.updateUserById(user_id, {
      password: newPassword,
      email_confirm: true,
      user_metadata: {
        ...(authUser.user.user_metadata ?? {}),
        phone,
        pin_reset_at: new Date().toISOString(),
      },
    });
    if (upErr) {
      console.error("admin-reset-pin: update failed", { user_id, phone, message: upErr.message });
      return safeError("Failed to update PIN", "update_failed", 200, {
        user_id,
        phone,
        credential_exists: credentialExists,
        pin_updated: false,
      });
    }

    console.log("admin-reset-pin: PIN updated", { user_id, phone, credential_exists: true });
    return json({
      ok: true,
      message: "PIN updated successfully",
      debug: { user_id, phone, credential_exists: true, pin_updated: true },
    }, 200);
  } catch (e) {
    console.error("admin-reset-pin crash:", (e as Error).message);
    return safeError("Failed to update PIN", "crash", 200, { pin_updated: false });
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
