// Technician login by phone + PIN.
// Looks up the user's synthetic email, signs in via password grant,
// returns the session tokens to the client. Rate-limits failed attempts.

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

function syntheticEmail(phoneDigits: string) {
  return `tech+${phoneDigits}@phone.317gd.local`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const phone = digitsOnly(String(body.phone ?? ""));
    const pin = String(body.pin ?? "").trim();
    if (!phone || !/^\d{4}$/.test(pin)) {
      return json({ error: "Enter your phone number and 4-digit PIN." }, 400);
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Rate-limit check
    const since = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString();
    const { count: failCount } = await admin
      .from("tech_login_attempts")
      .select("id", { count: "exact", head: true })
      .eq("phone", phone)
      .eq("succeeded", false)
      .gte("attempted_at", since);
    if ((failCount ?? 0) >= MAX_FAILS) {
      return json(
        { error: `Too many failed attempts. Try again in ${WINDOW_MIN} minutes.` },
        429,
      );
    }

    // Look up profile to give a clearer error and check status.
    const { data: profile } = await admin.rpc("find_user_by_phone", { _phone: phone });
    const u = Array.isArray(profile) ? profile[0] : profile;

    if (!u) {
      await admin.from("tech_login_attempts").insert({ phone, ip, succeeded: false });
      return json({ error: "No account found for this phone." }, 404);
    }

    // Try sign-in via anon client (so we don't bypass auth).
    const anon = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const email = syntheticEmail(phone);
    const password = `tech-${pin}-${phone}`;
    const { data: signed, error: signErr } = await anon.auth.signInWithPassword({
      email,
      password,
    });

    if (signErr || !signed.session) {
      await admin.from("tech_login_attempts").insert({ phone, ip, succeeded: false });
      return json({ error: "Incorrect PIN." }, 401);
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
    return json({ error: (e as Error).message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
