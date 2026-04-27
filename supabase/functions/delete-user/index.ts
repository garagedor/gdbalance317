// Deletes a user account (auth + public.users via cascade).
// Requires the caller to be authenticated and have role = 'management'.
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

    // Identify the caller from their JWT
    const callerClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !userData.user) {
      return json({ error: "Not authenticated" }, 401);
    }
    const callerId = userData.user.id;

    // Service role client for privileged operations
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Verify caller is management
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

    // Best-effort: clear the public.users row (cascade from auth deletion will
    // typically not exist without a FK, so delete explicitly to keep table tidy).
    const { error: pubDelErr } = await admin
      .from("users")
      .delete()
      .eq("id", targetId);
    if (pubDelErr) {
      // Not fatal — auth delete may still succeed. Log and continue.
      console.warn("public.users delete warning:", pubDelErr.message);
    }

    const { error: authDelErr } = await admin.auth.admin.deleteUser(targetId);
    if (authDelErr) {
      return json({ error: authDelErr.message }, 500);
    }

    return json({ ok: true });
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
