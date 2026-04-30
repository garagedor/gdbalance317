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
    if (!targetId) return json({ ok: false, error: "User not found", code: "user_id_required" });
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
      // Soft-delete inline using service role. We can't call the
      // archive_user RPC because it asserts auth.uid() is management,
      // but service-role calls have no auth.uid(). We've already verified
      // the caller above.
      const { data: targetRow, error: tgtErr } = await admin
        .from("users")
        .select("full_name")
        .eq("id", targetId)
        .maybeSingle();
      if (tgtErr) {
        console.error("target lookup failed:", tgtErr.message);
        return json({ error: "Could not load user" }, 500);
      }
      if (targetRow) {
        const newName = targetRow.full_name?.endsWith("(deactivated)")
          ? targetRow.full_name
          : `${targetRow.full_name} (deactivated)`;

        const { error: updErr } = await admin
          .from("users")
          .update({
            is_active: false,
            archived_at: new Date().toISOString(),
            status: "REJECTED",
            can_login: false,
            can_submit_reports: false,
            area_id: null,
            area_manager_id: null,
            full_name: newName,
            // Free the phone number so the same person (or anyone reusing
            // the number) can sign up fresh. Historical reports keep the
            // archived name for audit; phone is no longer needed on this row.
            phone: null,
            normalized_phone: null,
            phone_display: null,
          })
          .eq("id", targetId);
        if (updErr) {
          console.error("archive update failed:", updErr.message);
          return json({ error: "Could not archive user" }, 500);
        }

        // Clear all area memberships.
        await admin.from("user_areas").delete().eq("user_id", targetId);

        // Detach any technicians assigned to this user as their manager.
        await admin
          .from("users")
          .update({ area_manager_id: null })
          .eq("area_manager_id", targetId);
      }
    } else {
      // Hard-delete the public.users row first; user_areas cascades.
      const { error: pubDelErr } = await admin
        .from("users")
        .delete()
        .eq("id", targetId);
      if (pubDelErr) {
        console.warn("hard delete failed, falling back to archive:", pubDelErr.message);
        // Fall back to inline soft-delete.
        await admin
          .from("users")
          .update({
            is_active: false,
            archived_at: new Date().toISOString(),
            status: "REJECTED",
            can_login: false,
            can_submit_reports: false,
            area_id: null,
            area_manager_id: null,
            phone: null,
            normalized_phone: null,
            phone_display: null,
          })
          .eq("id", targetId);
        await admin.from("user_areas").delete().eq("user_id", targetId);
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
