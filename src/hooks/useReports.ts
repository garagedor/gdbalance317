import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import type { Database } from "@/integrations/supabase/types";

export type WeeklyReportRow = Database["public"]["Tables"]["weekly_reports"]["Row"];
export type JobRow = Database["public"]["Tables"]["weekly_report_jobs"]["Row"];
export type JobInsert = Database["public"]["Tables"]["weekly_report_jobs"]["Insert"];
export type ActivityRow = Database["public"]["Tables"]["report_activity_log"]["Row"];

/* ---------------- TECH ---------------- */

export function useMyReports() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ["my-reports", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekly_reports")
        .select("*")
        .eq("technician_id", user!.id)
        .order("week_start", { ascending: false });
      if (error) throw error;
      return data as WeeklyReportRow[];
    },
  });
}

export function useReport(reportId: string | undefined) {
  return useQuery({
    enabled: !!reportId,
    queryKey: ["report", reportId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekly_reports")
        .select("*")
        .eq("id", reportId!)
        .maybeSingle();
      if (error) throw error;
      return data as WeeklyReportRow | null;
    },
  });
}

export function useReportJobs(reportId: string | undefined) {
  return useQuery({
    enabled: !!reportId,
    queryKey: ["report-jobs", reportId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekly_report_jobs")
        .select("*")
        .eq("weekly_report_id", reportId!)
        .order("job_date", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as JobRow[];
    },
  });
}

export function useActivityLog(reportId: string | undefined) {
  return useQuery({
    enabled: !!reportId,
    queryKey: ["activity", reportId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("report_activity_log")
        .select("*")
        .eq("weekly_report_id", reportId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ActivityRow[];
    },
  });
}

export function useUpsertJob(reportId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (job: JobInsert & { id?: string }) => {
      const payload = { ...job, weekly_report_id: reportId };
      const { data, error } = job.id
        ? await supabase
            .from("weekly_report_jobs")
            .update(payload)
            .eq("id", job.id)
            .select("*")
            .maybeSingle()
        : await supabase
            .from("weekly_report_jobs")
            .insert(payload as JobInsert)
            .select("*")
            .maybeSingle();
      if (error) throw error;
      return data as JobRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["report-jobs", reportId] });
      qc.invalidateQueries({ queryKey: ["report", reportId] });
      qc.invalidateQueries({ queryKey: ["my-reports"] });
      qc.invalidateQueries({ queryKey: ["all-reports"] });
    },
  });
}

export function useDeleteJob(reportId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (jobId: string) => {
      const { error } = await supabase.from("weekly_report_jobs").delete().eq("id", jobId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["report-jobs", reportId] });
      qc.invalidateQueries({ queryKey: ["report", reportId] });
      qc.invalidateQueries({ queryKey: ["my-reports"] });
      qc.invalidateQueries({ queryKey: ["all-reports"] });
    },
  });
}

export function useChangeStatus(reportId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { status: WeeklyReportRow["status"]; manager_note?: string | null }) => {
      const patch: Partial<WeeklyReportRow> = { status: input.status };
      if (input.manager_note !== undefined) patch.manager_note = input.manager_note;
      const { error } = await supabase.from("weekly_reports").update(patch).eq("id", reportId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["report", reportId] });
      qc.invalidateQueries({ queryKey: ["activity", reportId] });
      qc.invalidateQueries({ queryKey: ["my-reports"] });
      qc.invalidateQueries({ queryKey: ["all-reports"] });
    },
  });
}

export function useValidateForSubmission(reportId: string) {
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("validate_report_for_submission", { _report_id: reportId });
      if (error) throw error;
      return (data as string[]) ?? [];
    },
  });
}

/* --------------- MANAGEMENT --------------- */

export interface AdminFilters {
  status?: WeeklyReportRow["status"] | "all";
  area_id?: string | "all";
  technician_id?: string | "all";
  week_start?: string | null;
  search?: string;
}

export function useAllReports(filters: AdminFilters) {
  return useQuery({
    queryKey: ["all-reports", filters],
    queryFn: async () => {
      let q = supabase
        .from("weekly_reports")
        .select("*, technician:users!weekly_reports_technician_id_fkey(id, full_name, email), area:areas(id, name)")
        .order("week_start", { ascending: false })
        .order("submitted_at", { ascending: false });
      if (filters.status && filters.status !== "all") q = q.eq("status", filters.status);
      if (filters.area_id && filters.area_id !== "all") q = q.eq("area_id", filters.area_id);
      if (filters.technician_id && filters.technician_id !== "all") q = q.eq("technician_id", filters.technician_id);
      if (filters.week_start) q = q.eq("week_start", filters.week_start);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as Array<
        WeeklyReportRow & {
          technician: { id: string; full_name: string; email: string } | null;
          area: { id: string; name: string } | null;
        }
      >;
      const term = (filters.search ?? "").toLowerCase().trim();
      if (!term) return rows;
      return rows.filter((r) => r.technician?.full_name?.toLowerCase().includes(term) || r.area?.name?.toLowerCase().includes(term));
    },
  });
}

export function useAreas() {
  return useQuery({
    queryKey: ["areas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("areas").select("*").order("name");
      if (error) throw error;
      return data as Database["public"]["Tables"]["areas"]["Row"][];
    },
  });
}

export function useTechnicians() {
  return useQuery({
    queryKey: ["technicians"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, full_name, email, area_id, is_active")
        .eq("role", "technician")
        .order("full_name");
      if (error) throw error;
      return data as Array<{ id: string; full_name: string; email: string; area_id: string | null; is_active: boolean }>;
    },
  });
}
