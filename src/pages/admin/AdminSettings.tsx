import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminLayout, DemoBadge } from "@/components/admin/AdminLayout";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  CalendarClock,
  ChevronRight,
  Loader2,
  MapPin,
  PlayCircle,
  Settings as SettingsIcon,
  Users,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const ITEMS = [
  { to: "/admin/users", icon: Users, label: "Users", desc: "Manage technicians, managers, and admins" },
  { to: "/admin/areas", icon: MapPin, label: "Areas", desc: "Service regions and locations" },
];

interface IndianaRow {
  current_local_time: string;
  week_start: string;
  week_end: string;
  opens_at: string;
  open_threshold_local: string;
  allowed: boolean;
}

export default function AdminSettings() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const [forcing, setForcing] = useState(false);
  const [forceFailures, setForceFailures] = useState<
    { user_id: string; full_name: string | null; reason: string }[]
  >([]);

  const { data: indiana, isLoading } = useQuery({
    queryKey: ["indiana-current-week"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("indiana_current_week");
      if (error) throw error;
      const rows = (data ?? []) as unknown as IndianaRow[];
      return rows[0] ?? null;
    },
    refetchInterval: 30_000,
  });

  const runOpener = useMutation({
    mutationFn: async (force: boolean) => {
      const { data, error } = await supabase.functions.invoke(
        "open-weekly-reports",
        { body: { force } },
      );
      if (error) throw error;
      return data as { ok: boolean; created: number };
    },
    onMutate: () => setRunning(true),
    onSettled: () => setRunning(false),
    onSuccess: (res) => {
      toast.success(`Opened ${res?.created ?? 0} new weekly report(s)`);
      qc.invalidateQueries({ queryKey: ["indiana-current-week"] });
      qc.invalidateQueries({ queryKey: ["all-reports"] });
      qc.invalidateQueries({ queryKey: ["my-reports"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to open reports"),
  });

  const forceOpenAll = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke(
        "force-open-all-reports",
        { body: {} },
      );
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? "Failed");
      return data as {
        ok: boolean;
        created: number;
        already_open: number;
        total_eligible: number;
        failures: { user_id: string; full_name: string | null; reason: string }[];
      };
    },
    onMutate: () => {
      setForcing(true);
      setForceFailures([]);
    },
    onSettled: () => setForcing(false),
    onSuccess: (res) => {
      setForceFailures(res.failures ?? []);
      toast.success(
        `Reports opened for all active users — ${res.created} new, ${res.already_open} already open` +
          (res.failures?.length ? ` (${res.failures.length} skipped)` : ""),
      );
      qc.invalidateQueries({ queryKey: ["indiana-current-week"] });
      qc.invalidateQueries({ queryKey: ["all-reports"] });
      qc.invalidateQueries({ queryKey: ["my-reports"] });
    },
    onError: (e: any) =>
      toast.error(e?.message ?? "Failed to force-open reports"),
  });

  const status = indiana?.allowed ? "Open" : "Closed";
  const statusCls = indiana?.allowed ? "text-emerald-600" : "text-muted-foreground";

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
                  Reports open every week at <b>8:00 PM Indiana time</b> (America/Indiana/Indianapolis).
                </p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => runOpener.mutate(true)}
              disabled={running}
            >
              {running ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <PlayCircle className="mr-2 h-4 w-4" />
              )}
              Open now
            </Button>
          </div>

          {isLoading || !indiana ? (
            <div className="p-6">
              <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <dl className="grid grid-cols-1 gap-4 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Indiana local time" value={fmtLocal(indiana.current_local_time)} />
              <Stat label="Opens at" value={fmtLocal(indiana.open_threshold_local)} />
              <Stat
                label="Current week"
                value={`${indiana.week_start} → ${indiana.week_end}`}
              />
              <Stat label="Status" value={status} valueCls={statusCls} />
            </dl>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

function Stat({
  label,
  value,
  valueCls,
}: {
  label: string;
  value: string;
  valueCls?: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className={`mt-1 font-semibold tabular-nums ${valueCls ?? ""}`}>
        {value}
      </dd>
    </div>
  );
}

function fmtLocal(s: string | null | undefined): string {
  if (!s) return "—";
  return s.replace("T", " ").slice(0, 16);
}
