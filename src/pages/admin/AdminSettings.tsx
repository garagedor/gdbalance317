import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminLayout, DemoBadge } from "@/components/admin/AdminLayout";
import { useNavigate } from "react-router-dom";
import {
  CalendarClock,
  ChevronRight,
  Loader2,
  MapPin,
  PlayCircle,
  Settings as SettingsIcon,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const ITEMS = [
  { to: "/admin/users", icon: Users, label: "Users", desc: "Manage technicians, managers, and admins" },
  { to: "/admin/areas", icon: MapPin, label: "Areas", desc: "Service regions and locations" },
];

interface OpenerRow {
  user_id: string;
  area_id: string;
  area_name: string | null;
  area_timezone: string | null;
  current_local_time: string;
  week_start: string;
  week_end: string;
  open_threshold_local: string;
  allowed: boolean;
  report_already_exists: boolean;
  full_name?: string | null;
}

export default function AdminSettings() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);

  // Fetch a flat snapshot of every active tech/area-manager and their gate state.
  const { data: gateRows, isLoading } = useQuery({
    queryKey: ["report-opener-debug"],
    queryFn: async () => {
      const { data: users, error: uErr } = await supabase
        .from("users")
        .select("id, full_name, role, is_active")
        .in("role", ["technician", "area_manager"])
        .eq("is_active", true)
        .order("full_name");
      if (uErr) throw uErr;

      const out: OpenerRow[] = [];
      for (const u of users ?? []) {
        const { data, error } = await supabase.rpc("debug_report_open_status", {
          _user_id: u.id,
        });
        if (error) continue;
        for (const r of (data ?? []) as OpenerRow[]) {
          out.push({ ...r, full_name: u.full_name });
        }
      }
      return out;
    },
  });

  const runOpener = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke(
        "open-weekly-reports",
      );
      if (error) throw error;
      return data as { ok: boolean; created: number };
    },
    onMutate: () => setRunning(true),
    onSettled: () => setRunning(false),
    onSuccess: (res) => {
      toast.success(`Opened ${res?.created ?? 0} new weekly report(s)`);
      qc.invalidateQueries({ queryKey: ["report-opener-debug"] });
      qc.invalidateQueries({ queryKey: ["all-reports"] });
      qc.invalidateQueries({ queryKey: ["my-reports"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to open reports"),
  });

  const pending = (gateRows ?? []).filter(
    (r) => r.allowed && !r.report_already_exists,
  );

  return (
    <AdminLayout title="Settings" description="Workspace configuration" actions={<DemoBadge />}>
      <div className="space-y-6">
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="flex items-center gap-3 border-b p-4">
            <SettingsIcon className="h-5 w-5 text-muted-foreground" />
            <h2 className="font-display text-base font-semibold">General</h2>
          </div>
          <ul className="divide-y">
            {ITEMS.map((it) => (
              <li key={it.to}>
                <button
                  onClick={() => nav(it.to)}
                  className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-muted/50"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                    <it.icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{it.label}</p>
                    <p className="text-xs text-muted-foreground">{it.desc}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border bg-card shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b p-4">
            <div className="flex items-center gap-3">
              <CalendarClock className="h-5 w-5 text-muted-foreground" />
              <div>
                <h2 className="font-display text-base font-semibold">
                  Weekly report opener
                </h2>
                <p className="text-xs text-muted-foreground">
                  Reports open at 9:30 PM local time of each technician's area.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => runOpener.mutate()}
              disabled={running || pending.length === 0}
            >
              {running ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <PlayCircle className="mr-2 h-4 w-4" />
              )}
              Open now
              {pending.length > 0 && (
                <span className="ml-1 opacity-80">({pending.length})</span>
              )}
            </Button>
          </div>

          {isLoading ? (
            <div className="p-6">
              <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !gateRows || gateRows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              No active technicians assigned to an area.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Technician</th>
                    <th className="px-3 py-2 text-left">Area</th>
                    <th className="px-3 py-2 text-left">Timezone</th>
                    <th className="px-3 py-2 text-left">Local time</th>
                    <th className="px-3 py-2 text-left">Opens at</th>
                    <th className="px-3 py-2 text-left">Week</th>
                    <th className="px-3 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {gateRows.map((r, i) => {
                    const status = r.report_already_exists
                      ? { label: "Open", cls: "text-emerald-600" }
                      : r.allowed
                        ? { label: "Ready (run opener)", cls: "text-amber-600" }
                        : { label: "Waiting", cls: "text-muted-foreground" };
                    return (
                      <tr key={`${r.user_id}-${r.area_id}-${i}`}>
                        <td className="px-3 py-2 font-medium">{r.full_name ?? "—"}</td>
                        <td className="px-3 py-2">{r.area_name ?? "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{r.area_timezone}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {fmtLocal(r.current_local_time)}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {fmtLocal(r.open_threshold_local)}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {r.week_start} → {r.week_end}
                        </td>
                        <td className={`px-3 py-2 font-semibold ${status.cls}`}>
                          {status.label}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

function fmtLocal(s: string | null | undefined): string {
  if (!s) return "—";
  // Postgres returns "YYYY-MM-DD HH:MM:SS" for `timestamp without tz`.
  return s.replace("T", " ").slice(0, 16);
}
