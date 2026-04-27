// Removes a user from the system.
//
// Behavior:
//   - Caller must be authenticated and have role = 'management'.
//   - You cannot delete yourself.
//   - If the target has any history (weekly reports, jobs, activity), we
//     SOFT-DELETE: deactivate, scrub assignments, suffix the name with
//     "(deactivated)", and remove their auth user so login is revoked
//     immediately. Historical reports keep displaying their archived name.
//   - If the target has zero history, we HARD-DELETE: remove the public.users
//     row and the auth.users row.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Missing authorization header" }, 401);
    }

    // Identify the caller from their JWT.
    const callerClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !userData.user) {
      return json({ error: "Not authenticated" }, 401);
    }
    const callerId = userData.user.id;

    // Service role client for privileged operations.
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Verify caller is management.
    const { data: callerRow, error: roleErr } = await admin
      .from("users")
      .select("role, is_active")
      .eq("id", callerId)
      .maybeSingle();
    if (roleErr) return json({ error: roleErr.message }, 500);
    if (!callerRow || callerRow.role !== "management" || !callerRow.is_active) {
      return json({ error: "Only management can delete users" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const targetId: string | undefined = body?.user_id;
    if (!targetId) return json({ error: "user_id is required" }, 400);
    if (targetId === callerId) {
      return json({ error: "You cannot delete your own account" }, 400);
    }

    // Decide soft vs hard based on existing history.
    const { data: hasHistoryRaw, error: histErr } = await admin.rpc(
      "user_has_history",
      { _user_id: targetId },
    );
    if (histErr) return json({ error: histErr.message }, 500);
    const hasHistory = !!hasHistoryRaw;

    if (hasHistory) {
      // Soft-delete: archive the public.users row (deactivates, scrubs
      // assignments, renames with "(deactivated)" suffix, clears user_areas,
      // detaches managed technicians).
      const { error: archErr } = await admin.rpc("archive_user", {
        _user_id: targetId,
      });
      if (archErr) {
        console.error("archive_user failed", archErr.message);
        return json({ error: archErr.message }, 500);
      }
    } else {
      // Hard-delete the public.users row first; user_areas cascades.
      const { error: pubDelErr } = await admin
        .from("users")
        .delete()
        .eq("id", targetId);
      if (pubDelErr) {
        // FK violation here would mean history slipped in between checks —
        // fall back to soft-delete.
        console.warn("hard delete fell back to archive:", pubDelErr.message);
        const { error: archErr } = await admin.rpc("archive_user", {
          _user_id: targetId,
        });
        if (archErr) return json({ error: archErr.message }, 500);
      }
    }

    // Always revoke login by removing the auth user.
    const { error: authDelErr } = await admin.auth.admin.deleteUser(targetId);
    if (authDelErr) {
      // Log but don't fail — public-side state is already cleaned. Auth-side
      // failure usually means the auth user was already gone.
      console.warn("auth deleteUser warning:", authDelErr.message);
    }

    return json({ ok: true, mode: hasHistory ? "soft" : "hard" });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message ?? "Unexpected error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders },
  });
}
