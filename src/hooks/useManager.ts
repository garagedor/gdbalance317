import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import type { Database } from "@/integrations/supabase/types";

export type WeeklyReportRow = Database["public"]["Tables"]["weekly_reports"]["Row"];

/** Technicians assigned to the signed-in area manager. */
export function useMyTechnicians() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ["am-technicians", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, full_name, email, phone, area_id, is_active")
        .eq("role", "technician")
        .eq("area_manager_id", user!.id)
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** All weekly reports for technicians under this area manager. */
export function useManagedReports() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ["am-reports", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekly_reports")
        .select("*, technician:users!weekly_reports_technician_id_fkey(id, full_name, email, area_manager_id), area:areas(id, name)")
        .order("week_start", { ascending: false });
      if (error) throw error;
      // RLS already filters to assigned techs, but double-check defensively
      return (data ?? []).filter((r: any) => r.technician?.area_manager_id === user!.id) as Array<
        WeeklyReportRow & {
          technician: { id: string; full_name: string; email: string; area_manager_id: string | null } | null;
          area: { id: string; name: string } | null;
        }
      >;
    },
  });
}

/** Update payout-tracking fields on an Approved report (RLS+trigger enforce permissions). */
export function usePayoutUpdate(reportId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      patch: Partial<
        Pick<
          WeeklyReportRow,
          | "report_sent_to_technician"
          | "amount_transferred"
          | "payment_note"
          | "balance_payment_status"
        >
      >
    ) => {
      const { error } = await supabase.from("weekly_reports").update(patch).eq("id", reportId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["report", reportId] });
      qc.invalidateQueries({ queryKey: ["am-reports"] });
      qc.invalidateQueries({ queryKey: ["my-reports"] });
      qc.invalidateQueries({ queryKey: ["all-reports"] });
    },
  });
}
