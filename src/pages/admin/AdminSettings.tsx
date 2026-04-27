import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminLayout, DemoBadge } from "@/components/admin/AdminLayout";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  CalendarClock,
  ChevronRight,
  Clock,
  Loader2,
  Lock,
  LockOpen,
  MapPin,
  PlayCircle,
  Settings as SettingsIcon,
  Users,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
  is_locked: boolean;
  open_hour: number;
  open_minute: number;
}

export default function AdminSettings() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const [forcing, setForcing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [reopening, setReopening] = useState(false);
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

  // Editable open time (HH:MM)
  const [hour, setHour] = useState<number>(20);
  const [minute, setMinute] = useState<number>(0);
  useEffect(() => {
    if (indiana) {
      setHour(indiana.open_hour ?? 20);
      setMinute(indiana.open_minute ?? 0);
    }
  }, [indiana?.open_hour, indiana?.open_minute]);

  const timeDirty = useMemo(() => {
    if (!indiana) return false;
    return hour !== indiana.open_hour || minute !== indiana.open_minute;
  }, [hour, minute, indiana?.open_hour, indiana?.open_minute]);

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

  const closeWeek = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("close-current-week", {
        body: {},
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? "Failed");
      return data as { ok: true; already_locked: boolean; week_start: string };
    },
    onMutate: () => setClosing(true),
    onSettled: () => setClosing(false),
    onSuccess: (res) => {
      toast.success(
        res.already_locked
          ? "This week was already closed."
          : `Week ${res.week_start} closed. Technicians can no longer edit reports for this week.`,
      );
      qc.invalidateQueries({ queryKey: ["indiana-current-week"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to close week"),
  });

  const reopenWeek = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("reopen-week", {
        body: {},
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? "Failed");
      return data as { ok: true; week_start: string };
    },
    onMutate: () => setReopening(true),
    onSettled: () => setReopening(false),
    onSuccess: (res) => {
      toast.success(`Week ${res.week_start} reopened.`);
      qc.invalidateQueries({ queryKey: ["indiana-current-week"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to reopen week"),
  });

  const saveOpenTime = useMutation({
    mutationFn: async () => {
      const h = Math.max(0, Math.min(23, Math.trunc(hour)));
      const m = Math.max(0, Math.min(59, Math.trunc(minute)));
      const { error } = await supabase
        .from("app_settings")
        .update({ open_hour: h, open_minute: m })
        .eq("id", true);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Open time updated");
      qc.invalidateQueries({ queryKey: ["indiana-current-week"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save open time"),
  });

  const isLocked = indiana?.is_locked === true;
  const status = isLocked ? "Closed" : indiana?.allowed ? "Open" : "Scheduled";
  const statusCls = isLocked
    ? "text-rose-600"
    : indiana?.allowed
    ? "text-emerald-600"
    : "text-amber-600";

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

        {/* WEEK MANAGEMENT */}
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
            <div className="flex items-center gap-3">
              <CalendarClock className="h-5 w-5 text-muted-foreground" />
              <div>
                <h2 className="font-display text-base font-semibold">Week management</h2>
                <p className="text-xs text-muted-foreground">
                  Control when the weekly report cycle opens, closes, and who can submit. Times are{" "}
                  <b>America/Indiana/Indianapolis</b>.
                </p>
              </div>
            </div>
            <Badge variant="outline" className={statusCls}>
              {isLocked ? <Lock className="mr-1 h-3 w-3" /> : <LockOpen className="mr-1 h-3 w-3" />}
              {status}
            </Badge>
          </div>

          {/* Cards */}
          {isLoading || !indiana ? (
            <div className="p-6">
              <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Current week"
                primary={`${indiana.week_start} → ${indiana.week_end}`}
                hint={`Indiana time: ${fmtLocal(indiana.current_local_time)}`}
              />
              <StatCard
                label="Next opens"
                primary={fmtLocal(indiana.open_threshold_local)}
                hint={isLocked ? "Currently locked by admin" : indiana.allowed ? "Already open" : "Scheduled"}
              />
              <StatCard
                label="Open time"
                primary={fmtTime(indiana.open_hour, indiana.open_minute)}
                hint="Edit below to change future cycles"
              />
              <StatCard
                label="Status"
                primary={status}
                primaryCls={statusCls}
                hint={
                  isLocked
                    ? "New reports & edits blocked"
                    : indiana.allowed
                    ? "Technicians can submit"
                    : "Will open on schedule"
                }
              />
            </div>
          )}

          {/* Actions */}
          <div className="grid grid-cols-1 gap-3 border-t bg-muted/20 p-4 md:grid-cols-2">
            {/* Close current week */}
            <Card>
              <CardContent className="flex flex-col gap-3 p-4">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Lock className="h-4 w-4 text-rose-600" /> Close current week
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Locks {indiana ? `${indiana.week_start} → ${indiana.week_end}` : "this week"}.
                    Technicians and area managers can no longer add or edit jobs. All existing data,
                    balances, and reports stay intact. You can reopen at any time.
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" disabled={closing || isLocked || !indiana}>
                      {closing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
                      {isLocked ? "Already closed" : "Close current week"}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Close the current week?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to close the current week ({indiana?.week_start} →{" "}
                        {indiana?.week_end})? Technicians will not be able to add or edit jobs until
                        you reopen it. Existing balances and history are preserved.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => closeWeek.mutate()}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Yes, close week
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                {isLocked && (
                  <Button
                    variant="outline"
                    onClick={() => reopenWeek.mutate()}
                    disabled={reopening}
                  >
                    {reopening ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <LockOpen className="mr-2 h-4 w-4" />
                    )}
                    Reopen this week (admin override)
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Open next week */}
            <Card>
              <CardContent className="flex flex-col gap-3 p-4">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <PlayCircle className="h-4 w-4 text-emerald-600" /> Open next week
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Creates draft weekly reports for every active technician and area manager
                    immediately, even before the scheduled open time. Uses Monday → Sunday cycles.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => runOpener.mutate(true)}
                    disabled={running || forcing}
                  >
                    {running ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <PlayCircle className="mr-2 h-4 w-4" />
                    )}
                    Open next week
                  </Button>
                  <Button
                    onClick={() => forceOpenAll.mutate()}
                    disabled={forcing || running}
                  >
                    {forcing ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Zap className="mr-2 h-4 w-4" />
                    )}
                    Open for all users
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Open time editor */}
            <Card className="md:col-span-2">
              <CardContent className="flex flex-col gap-3 p-4">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Clock className="h-4 w-4 text-primary" /> Weekly report open time
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    The hour each Sunday when reports automatically become available, in
                    America/Indiana/Indianapolis time. Affects all future cycles.
                  </p>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      max={23}
                      value={hour}
                      onChange={(e) => setHour(Number(e.target.value))}
                      className="w-20 text-center font-mono tabular-nums"
                      aria-label="Hour (0-23)"
                    />
                    <span className="text-muted-foreground">:</span>
                    <Input
                      type="number"
                      min={0}
                      max={59}
                      step={5}
                      value={minute}
                      onChange={(e) => setMinute(Number(e.target.value))}
                      className="w-20 text-center font-mono tabular-nums"
                      aria-label="Minute (0-59)"
                    />
                    <span className="text-xs text-muted-foreground">
                      ({fmtTime(hour, minute)} Indiana)
                    </span>
                  </div>
                  <Button
                    onClick={() => saveOpenTime.mutate()}
                    disabled={!timeDirty || saveOpenTime.isPending}
                  >
                    {saveOpenTime.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save open time
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {forceFailures.length > 0 && (
            <div className="border-t bg-amber-50 p-4 dark:bg-amber-950/30">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
                <AlertTriangle className="h-4 w-4" />
                {forceFailures.length} user(s) skipped
              </div>
              <ul className="space-y-1 text-xs text-amber-900 dark:text-amber-200">
                {forceFailures.map((f) => (
                  <li key={f.user_id} className="flex items-center justify-between gap-3">
                    <span>{f.full_name ?? f.user_id}</span>
                    <span className="rounded bg-amber-200/60 px-2 py-0.5 font-medium dark:bg-amber-900/60">
                      {f.reason}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

function StatCard({
  label,
  primary,
  primaryCls,
  hint,
}: {
  label: string;
  primary: string;
  primaryCls?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-sm font-semibold tabular-nums ${primaryCls ?? ""}`}>
        {primary}
      </div>
      {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function fmtLocal(s: string | null | undefined): string {
  if (!s) return "—";
  return s.replace("T", " ").slice(0, 16);
}

function fmtTime(h: number, m: number): string {
  const hh = ((h + 11) % 12) + 1;
  const ampm = h >= 12 ? "PM" : "AM";
  return `${hh}:${String(m).padStart(2, "0")} ${ampm}`;
}
