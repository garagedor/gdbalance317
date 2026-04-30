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

    // 2) Check for an existing user with this phone.
    //    - Active / pending row → block as duplicate.
    //    - Archived row (admin deleted/rejected) → scrub phone+email so the
    //      number is freed and the new signup can proceed cleanly.
    const { data: existingRows, error: dupErr } = await admin
      .from("users")
      .select("id, phone, archived_at, is_active, pending_approval")
      .filter("phone", "eq", phone);
    if (dupErr) {
      console.error("tech-signup duplicate-check error:", dupErr);
      return fail("Could not verify phone number. Please try again.", "dup_lookup_failed", 500);
    }
    const liveRow = (existingRows ?? []).find((r) => !r.archived_at);
    if (liveRow) {
      return fail("This phone number is already registered.", "phone_exists");
    }
    // Free the phone number on any archived rows so it doesn't collide.
    const archivedIds = (existingRows ?? []).filter((r) => r.archived_at).map((r) => r.id);
    if (archivedIds.length > 0) {
      const { error: scrubErr } = await admin
        .from("users")
        .update({ phone: null })
        .in("id", archivedIds);
      if (scrubErr) {
        console.error("tech-signup scrub archived phone error:", scrubErr);
        return fail("Could not verify phone number. Please try again.", "dup_lookup_failed", 500);
      }
    }

    const email = syntheticEmail(phone);

    // Helper: scan ALL pages of auth.users to find one matching this email.
    // Supabase listUsers doesn't support a server-side email filter reliably
    // across versions, and a single page misses users once the table grows.
    async function findAuthUserByEmail(targetEmail: string) {
      const target = targetEmail.toLowerCase();
      const perPage = 1000;
      for (let page = 1; page <= 50; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
        if (error) {
          console.warn("listUsers page error:", error.message);
          return null;
        }
        const hit = data?.users?.find((au) => au.email?.toLowerCase() === target);
        if (hit) return hit;
        if (!data?.users || data.users.length < perPage) return null;
      }
      return null;
    }

    // 2b) Clean up any orphan auth user that used this synthetic email
    //     (e.g. previous signup attempt that failed mid-flow, a stale auth
    //     user whose profile was hard-deleted, or an admin delete where the
    //     auth-side removal failed). Without this, createUser would fail with
    //     "already registered" even though no live profile exists.
    try {
      const orphan = await findAuthUserByEmail(email);
      if (orphan) {
        const { data: prof } = await admin
          .from("users")
          .select("id, archived_at")
          .eq("id", orphan.id)
          .maybeSingle();
        if (!prof || prof.archived_at) {
          await admin.auth.admin.deleteUser(orphan.id);
        }
      }
    } catch (e) {
      console.warn("tech-signup orphan auth cleanup failed:", (e as Error).message);
      // non-fatal — createUser recovery below will retry.
    }

    // Pad PIN to satisfy Supabase 6-char password minimum.
    // We never expose this; login derives the same value server-side.
    const password = `tech-${pin}-${phone}`;

    // 3) Create the auth user (email-confirmed so they can log in).
    let { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, phone },
    });

    // 3b) Recovery: if createUser says "already registered" but we already
    //     verified above that no live profile exists for this phone, the auth
    //     user is an orphan we missed. Find it, delete it, retry once.
    if (createErr || !created?.user) {
      const msg = (createErr?.message ?? "").toLowerCase();
      const looksDuplicate =
        msg.includes("already") || msg.includes("registered") || msg.includes("exists");

      if (looksDuplicate) {
        console.warn("tech-signup createUser duplicate; attempting orphan recovery");
        try {
          const orphan = await findAuthUserByEmail(email);
          if (orphan) {
            const { data: prof } = await admin
              .from("users")
              .select("id, archived_at")
              .eq("id", orphan.id)
              .maybeSingle();
            // Safe to delete: we already confirmed (step 2) there is no live
            // profile for this phone. Either no profile at all, or archived.
            if (!prof || prof.archived_at) {
              await admin.auth.admin.deleteUser(orphan.id);
              const retry = await admin.auth.admin.createUser({
                email,
                password,
                email_confirm: true,
                user_metadata: { full_name, phone },
              });
              created = retry.data;
              createErr = retry.error;
            } else {
              // A live profile actually exists — genuine duplicate.
              return fail("This phone number is already registered.", "phone_exists");
            }
          }
        } catch (e) {
          console.error("tech-signup recovery failed:", (e as Error).message);
        }
      }

      if (createErr || !created?.user) {
        console.error("tech-signup createUser error:", createErr);
        return fail("Could not create your account. Please try again.", "auth_create_failed", 500);
      }
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
