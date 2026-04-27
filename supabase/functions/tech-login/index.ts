// Technician login by phone + PIN.
// Returns business errors as HTTP 200 with { ok:false, error, code } so
// the supabase-js client doesn't surface a generic "non-2xx" error.
// True server crashes still return 500.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MAX_FAILS = 5;
const WINDOW_MIN = 15;

function digitsOnly(s: string) {
  return (s ?? "").replace(/\D/g, "");
}

// Normalize any phone input (with +1, dashes, spaces, country code) to the
// last 10 digits — the same form signup stores. This is the single
// source of truth for phone matching across signup + login.
function normalizePhone(s: string) {
  const d = digitsOnly(s);
  return d.length >= 10 ? d.slice(-10) : d;
}

function syntheticEmail(phoneDigits: string) {
  return `tech+${phoneDigits}@phone.317gd.local`;
}

function fail(error: string, code: string, status = 200) {
  // status 200 so supabase.functions.invoke doesn't throw a generic error;
  // the frontend reads { ok:false, error } from the body.
  return json({ ok: false, error, code }, status);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ---- Env validation ----
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
      console.error("tech-login: missing env vars");
      return json({ ok: false, error: "Server is misconfigured. Contact support.", code: "config" }, 500);
    }

    // ---- Body validation ----
    const body = await req.json().catch(() => ({}));
    const phone = normalizePhone(String(body?.phone ?? ""));
    const pin = String(body?.pin ?? "").trim();
    if (!phone) return fail("Enter your phone number.", "phone_required");
    if (phone.length !== 10) {
      return fail("Please enter a valid 10-digit phone number.", "phone_invalid");
    }
    if (!/^\d{4}$/.test(pin)) return fail("PIN must be exactly 4 digits.", "pin_invalid");

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Rate-limit lockout disabled — admin requested unrestricted login access.
    // Failed attempts are still recorded below for audit purposes.

    // ---- Look up the user by phone (uses SECURITY DEFINER RPC, bypasses RLS) ----
    const { data: profileRows, error: rpcErr } = await admin.rpc(
      "find_user_by_phone",
      { _phone: phone },
    );
    if (rpcErr) {
      console.error("tech-login find_user_by_phone error:", rpcErr);
      return json({ ok: false, error: "Lookup failed. Try again.", code: "lookup_failed" }, 500);
    }
    const u = Array.isArray(profileRows) ? profileRows[0] : profileRows;
    if (!u) {
      await admin.from("tech_login_attempts").insert({ phone, ip, succeeded: false });
      return fail("Account not found.", "not_found");
    }

    if (u.is_active === false && u.pending_approval === false) {
      // Explicitly deactivated by admin (not just pending).
      return fail("This account is deactivated. Contact your admin.", "deactivated");
    }

    // ---- Find the real auth email (some users were created before phone+PIN
    //      and have a real email; new self-signups have a synthetic one). ----
    let authEmail = syntheticEmail(phone);
    try {
      const { data: authUser } = await admin.auth.admin.getUserById(u.id);
      if (authUser?.user?.email) authEmail = authUser.user.email;
    } catch (e) {
      console.error("tech-login getUserById failed:", (e as Error).message);
      // fall back to synthetic email
    }

    // ---- Attempt sign-in via anon client (does not bypass auth). ----
    const password = `tech-${pin}-${phone}`;
    const anon = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: signed, error: signErr } = await anon.auth.signInWithPassword({
      email: authEmail,
      password,
    });

    if (signErr || !signed?.session) {
      await admin.from("tech_login_attempts").insert({ phone, ip, succeeded: false });
      // If this is a pre-existing tech created before phone+PIN was rolled out,
      // their PIN was never set. Tell them clearly.
      if (authEmail !== syntheticEmail(phone)) {
        return fail(
          "PIN not set for this account yet. Ask your admin to reset your PIN.",
          "pin_not_set",
        );
      }
      return fail("Invalid phone or PIN.", "invalid_credentials");
    }

    await admin.from("tech_login_attempts").insert({ phone, ip, succeeded: true });

    return json(
      {
        ok: true,
        access_token: signed.session.access_token,
        refresh_token: signed.session.refresh_token,
        pending_approval: u.pending_approval ?? false,
      },
      200,
    );
  } catch (e) {
    console.error("tech-login crash:", (e as Error).message);
    return json({ ok: false, error: "Unexpected server error.", code: "crash" }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
