// Technician self-signup with phone + PIN + company invite code.
// Creates a Supabase auth user via service role, marks the public.users
// row as `pending_approval = true` so admin must approve before access.
//
// Business errors are returned as HTTP 200 with { ok:false, error, code } so
// supabase.functions.invoke doesn't surface a generic "non-2xx" error.
// True server crashes return 500 with the same shape.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function digitsOnly(s: string) {
  return (s ?? "").replace(/\D/g, "");
}

// Normalize to last 10 digits (US numbering plan). Same rule as tech-login,
// so a number entered as "+1 347-542-9403", "13475429403", or "3475429403"
// always stores and matches as "3475429403".
function normalizePhone(s: string) {
  const d = digitsOnly(s);
  return d.length >= 10 ? d.slice(-10) : d;
}

function syntheticEmail(phoneDigits: string) {
  // Stable, unique, never delivered. Lets us reuse Supabase Auth.
  return `tech+${phoneDigits}@phone.317gd.local`;
}

function fail(error: string, code: string, status = 200) {
  return json({ ok: false, error, code }, status);
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ---- Env validation ----
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_KEY) {
      console.error("tech-signup: missing env vars");
      return fail("Server is misconfigured. Please contact admin.", "config", 500);
    }

    // ---- Body validation ----
    const body = await req.json().catch(() => ({}));
    const full_name: string = String(body.full_name ?? "").trim();
    const phone_raw: string = String(body.phone ?? "").trim();
    const pin: string = String(body.pin ?? "").trim();
    const invite_code: string = String(body.invite_code ?? "").trim();

    if (!full_name || full_name.length < 2 || full_name.length > 120) {
      return fail("Please enter your full name.", "name_invalid");
    }
    const phone = normalizePhone(phone_raw);
    if (phone.length !== 10) {
      return fail("Please enter a valid 10-digit phone number.", "phone_invalid");
    }
    if (!/^\d{4}$/.test(pin)) {
      return fail("PIN must be exactly 4 digits.", "pin_invalid");
    }
    if (!invite_code) {
      return fail("Company invite code is required.", "code_required");
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1) Validate invite code.
    const { data: codeOk, error: codeErr } = await admin.rpc(
      "is_invite_code_valid",
      { _code: invite_code },
    );
    if (codeErr) {
      console.error("tech-signup invite-code RPC error:", codeErr);
      return fail("Could not validate invite code. Please try again.", "code_lookup_failed", 500);
    }
    if (!codeOk) return fail("Invalid company invite code.", "code_invalid");

    // 2) Reject duplicate phone.
    const { data: existing, error: dupErr } = await admin
      .from("users")
      .select("id")
      .filter("phone", "eq", phone)
      .maybeSingle();
    if (dupErr) {
      console.error("tech-signup duplicate-check error:", dupErr);
      return fail("Could not verify phone number. Please try again.", "dup_lookup_failed", 500);
    }
    if (existing) {
      return fail("This phone number is already registered.", "phone_exists");
    }

    const email = syntheticEmail(phone);
    // Pad PIN to satisfy Supabase 6-char password minimum.
    // We never expose this; login derives the same value server-side.
    const password = `tech-${pin}-${phone}`;

    // 3) Create the auth user (email-confirmed so they can log in).
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, phone },
    });
    if (createErr || !created.user) {
      console.error("tech-signup createUser error:", createErr);
      // Most common case: an auth user with this synthetic email already exists.
      const msg = (createErr?.message ?? "").toLowerCase();
      if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
        return fail("This phone number is already registered.", "phone_exists");
      }
      return fail("Could not create your account. Please try again.", "auth_create_failed", 500);
    }

    // 4) Ensure public.users row exists, set pending + inactive.
    const { error: upErr } = await admin
      .from("users")
      .upsert(
        {
          id: created.user.id,
          full_name,
          email,
          phone,
          role: "technician",
          is_active: false,
          pending_approval: true,
        },
        { onConflict: "id" },
      );
    if (upErr) {
      console.error("tech-signup profile upsert error:", upErr);
      // Roll back the auth user if profile patch fails.
      await admin.auth.admin.deleteUser(created.user.id);
      return fail("Could not finish setting up your account. Please try again.", "profile_failed", 500);
    }

    return json({ ok: true, user_id: created.user.id }, 200);
  } catch (e) {
    console.error("tech-signup crash:", (e as Error).message);
    return fail("Something went wrong. Please try again.", "crash", 500);
  }
});
