// Technician self-signup with phone + PIN + company invite code.
// Creates a Supabase auth user via service role, marks the public.users
// row as `pending_approval = true` so admin must approve before access.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function digitsOnly(s: string) {
  return (s ?? "").replace(/\D/g, "");
}

function syntheticEmail(phoneDigits: string) {
  // Stable, unique, never delivered. Lets us reuse Supabase Auth.
  return `tech+${phoneDigits}@phone.317gd.local`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const full_name: string = String(body.full_name ?? "").trim();
    const phone_raw: string = String(body.phone ?? "").trim();
    const pin: string = String(body.pin ?? "").trim();
    const invite_code: string = String(body.invite_code ?? "").trim();

    if (!full_name || full_name.length < 2 || full_name.length > 120) {
      return json({ error: "Full name is required (2-120 chars)." }, 400);
    }
    const phone = digitsOnly(phone_raw);
    if (phone.length < 7 || phone.length > 15) {
      return json({ error: "Enter a valid phone number." }, 400);
    }
    if (!/^\d{4}$/.test(pin)) {
      return json({ error: "PIN must be exactly 4 digits." }, 400);
    }
    if (!invite_code) {
      return json({ error: "Company invite code is required." }, 400);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1) Validate invite code.
    const { data: codeOk, error: codeErr } = await admin.rpc(
      "is_invite_code_valid",
      { _code: invite_code },
    );
    if (codeErr) return json({ error: codeErr.message }, 500);
    if (!codeOk) return json({ error: "Invalid company invite code." }, 400);

    // 2) Reject duplicate phone.
    const { data: existing } = await admin
      .from("users")
      .select("id")
      .filter("phone", "eq", phone)
      .maybeSingle();
    if (existing) {
      return json(
        { error: "This phone number is already registered." },
        409,
      );
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
      return json({ error: createErr?.message ?? "Could not create account" }, 400);
    }

    // 4) Ensure public.users row exists, set pending + inactive.
    // The handle_new_user trigger inserts a default row; we patch it.
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
      // Roll back the auth user if profile patch fails.
      await admin.auth.admin.deleteUser(created.user.id);
      return json({ error: upErr.message }, 500);
    }

    return json({ ok: true, user_id: created.user.id }, 200);
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
