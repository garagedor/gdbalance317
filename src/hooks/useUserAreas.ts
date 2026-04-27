import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";

export interface UserAreaRow {
  user_id: string;
  area_id: string;
  is_primary: boolean;
}

/** Fetch all user→area memberships (admin view). */
export function useAllUserAreas() {
  return useQuery({
    queryKey: ["user-areas-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_areas" as any)
        .select("user_id, area_id, is_primary");
      if (error) throw error;
      return (data ?? []) as UserAreaRow[];
    },
  });
}

/** Memberships for the signed-in user (used to know my own assigned areas). */
export function useMyAreas() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ["my-user-areas", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_areas" as any)
        .select("user_id, area_id, is_primary")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? []) as UserAreaRow[];
    },
  });
}

/**
 * Replace the set of areas assigned to a user. Also updates `users.area_id`
 * to the chosen primary so existing single-area code keeps working.
 */
export function useSetUserAreas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userId,
      areaIds,
      primaryId,
    }: {
      userId: string;
      areaIds: string[];
      primaryId: string | null;
    }) => {
      // Resolve a primary if caller didn't pick one.
      const effectivePrimary =
        primaryId && areaIds.includes(primaryId) ? primaryId : areaIds[0] ?? null;

      // 1) Sync users.area_id (the trigger will mirror it into user_areas)
      const { error: uErr } = await supabase
        .from("users")
        .update({ area_id: effectivePrimary })
        .eq("id", userId);
      if (uErr) throw uErr;

      // 2) Wipe other memberships then insert the desired set.
      const { error: dErr } = await supabase
        .from("user_areas" as any)
        .delete()
        .eq("user_id", userId);
      if (dErr) throw dErr;

      if (areaIds.length > 0) {
        const rows = areaIds.map((aid) => ({
          user_id: userId,
          area_id: aid,
          is_primary: aid === effectivePrimary,
        }));
        const { error: iErr } = await supabase.from("user_areas" as any).insert(rows);
        if (iErr) throw iErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-areas-all"] });
      qc.invalidateQueries({ queryKey: ["my-user-areas"] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["technicians"] });
      qc.invalidateQueries({ queryKey: ["am-technicians"] });
    },
  });
}
