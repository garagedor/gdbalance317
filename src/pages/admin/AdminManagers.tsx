import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout, StatCard } from "@/components/admin/AdminLayout";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/StatusPill";
import { fmtMoney, moneyClass } from "@/lib/format";
import { fmtWeekRange } from "@/lib/week";
import { computeLmSettlement } from "@/lib/finance/lmSettlement";
import {
  AlertTriangle,
  Building2,
  Crown,
  DollarSign,
  Loader2,
  MapPin,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

const n = (v: unknown) => Number(v ?? 0);

interface AreaRow {
  id: string;
  name: string;
  manager_profit_percent: number;
}
interface ManagerRow {
  id: string;
  full_name: string;
  email: string;
  area_id: string | null;
  commission_rate: number;
}
interface TechRow {
  id: string;
  full_name: string;
  area_id: string | null;
  area_manager_id: string | null;
}
interface ReportRow {
  id: string;
  technician_id: string;
  area_id: string;
  week_start: string;
  week_end: string;
  status: string;
  total_sales: number;
}
interface JobRow {
  weekly_report_id: string;
  lm_cash: number | null;
  lm_check: number | null;
  lm_parts: number | null;
  total_profit: number | null;
}

/** Everything this page needs, from the same tables the rest of the app uses. */
function useManagersData(weekStart: string | null) {
  return useQuery({
    queryKey: ["admin-managers", weekStart],
    queryFn: async () => {
      const [mgrRes, areaRes, uaRes, techRes] = await Promise.all([
        supabase
          .from("users")
          .select("id, full_name, email, area_id, commission_rate, is_active, archived_at, pending_approval, status")
          .eq("role", "area_manager")
          .order("full_name"),
        supabase.from("areas").select("id, name, manager_profit_percent").order("name"),
        supabase.from("user_areas").select("user_id, area_id, is_primary"),
        supabase
          .from("users")
          .select("id, full_name, area_id, area_manager_id")
          .eq("role", "technician")
          .eq("is_active", true)
          .is("archived_at", null),
      ]);
      for (const r of [mgrRes, areaRes, uaRes, techRes]) if (r.error) throw r.error;

      const managers = ((mgrRes.data ?? []) as any[])
        .filter((u) => u.is_active && !u.archived_at && !u.pending_approval && u.status !== "rejected")
        .map((u) => ({
          id: u.id,
          full_name: u.full_name,
          email: u.email,
          area_id: u.area_id,
          commission_rate: n(u.commission_rate),
        })) as ManagerRow[];

      let reports: ReportRow[] = [];
      let jobs: JobRow[] = [];
      if (weekStart) {
        const { data: rep, error: rErr } = await supabase
          .from("weekly_reports")
          .select("id, technician_id, area_id, week_start, week_end, status, total_sales")
          .eq("week_start", weekStart);
        if (rErr) throw rErr;
        reports = (rep ?? []) as ReportRow[];
        const ids = reports.map((r) => r.id);
        if (ids.length) {
          const { data: jb, error: jErr } = await supabase
            .from("weekly_report_jobs")
            .select("weekly_report_id, lm_cash, lm_check, lm_parts, total_profit")
            .in("weekly_report_id", ids);
          if (jErr) throw jErr;
          jobs = (jb ?? []) as JobRow[];
        }
      }

      return {
        managers,
        areas: (areaRes.data ?? []) as AreaRow[],
        userAreas: (uaRes.data ?? []) as Array<{ user_id: string; area_id: string; is_primary: boolean }>,
        techs: (techRes.data ?? []) as TechRow[],
        reports,
        jobs,
      };
    },
  });
}

/** Weeks that actually have reports — the week picker source. */
function useReportWeeks() {
  return useQuery({
    queryKey: ["admin-managers-weeks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekly_reports")
        .select("week_start, week_end")
        .order("week_start", { ascending: false })
        .limit(500);
      if (error) throw error;
      const seen = new Map<string, { week_start: string; week_end: string }>();
      for (const r of data ?? []) if (!seen.has(r.week_start)) seen.set(r.week_start, r as any);
      return Array.from(seen.values());
    },
  });
}

export default function AdminManagers() {
  const nav = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [week, setWeek] = useState<string | null>(null);

  const weeksQ = useReportWeeks();
  const weeks = weeksQ.data ?? [];
  const activeWeek = week ?? weeks[0]?.week_start ?? null;
  const dataQ = useManagersData(activeWeek);

  const rows = useMemo(() => {
    const d = dataQ.data;
    if (!d) return [];
    const areaById = new Map(d.areas.map((a) => [a.id, a]));
    const jobsByReport = new Map<string, JobRow[]>();
    for (const j of d.jobs) {
      const list = jobsByReport.get(j.weekly_report_id) ?? [];
      list.push(j);
      jobsByReport.set(j.weekly_report_id, list);
    }
    const areasOf = (userId: string, primary: string | null) =>
      Array.from(
        new Set([
          ...d.userAreas.filter((u) => u.user_id === userId).map((u) => u.area_id),
          ...(primary ? [primary] : []),
        ]),
      );

    return d.managers.map((m) => {
      const areaIds = areasOf(m.id, m.area_id);
      const areas = areaIds.map((id) => areaById.get(id)).filter(Boolean) as AreaRow[];
      const techs = d.techs.filter(
        (t) =>
          t.area_manager_id === m.id ||
          areasOf(t.id, t.area_id).some((a) => areaIds.includes(a)),
      );
      const techIds = new Set(techs.map((t) => t.id));
      const reports = d.reports.filter(
        (r) => areaIds.includes(r.area_id) || techIds.has(r.technician_id),
      );
      const revenue = reports.reduce((s, r) => s + n(r.total_sales), 0);

      // Earnings / balance: the same LM settlement used on the report pages,
      // computed per area so each area's configured profit % is respected.
      let earnings = 0;
      let net = 0;
      const byArea = new Map<string, ReportRow[]>();
      for (const r of reports) {
        const list = byArea.get(r.area_id) ?? [];
        list.push(r);
        byArea.set(r.area_id, list);
      }
      for (const [areaId, areaReports] of byArea) {
        const pct = n(areaById.get(areaId)?.manager_profit_percent ?? 40);
        const jobInputs = areaReports.flatMap((r) =>
          (jobsByReport.get(r.id) ?? []).map((j) => ({
            lm_cash: n(j.lm_cash),
            lm_check: n(j.lm_check),
            lm_parts: n(j.lm_parts),
            total_profit: n(j.total_profit),
          })),
        );
        const s = computeLmSettlement(jobInputs, pct);
        earnings += s.am_pool;
        net += s.net_lm_balance;
      }

      return {
        manager: m,
        areas,
        areaIds,
        techs,
        reports,
        revenue: Math.round(revenue * 100) / 100,
        earnings: Math.round(earnings * 100) / 100,
        net: Math.round(net * 100) / 100,
        ratePct: areas.length
          ? Math.round(
              areas.reduce((s, a) => s + n(a.manager_profit_percent), 0) / areas.length,
            )
          : null,
      };
    });
  }, [dataQ.data]);

  // Managed revenue / top area: dedupe reports shared between managers.
  const totals = useMemo(() => {
    const seen = new Set<string>();
    let revenue = 0;
    let openBalance = 0;
    const byArea = new Map<string, number>();
    for (const row of rows) {
      openBalance += row.net > 0 ? row.net : 0;
      for (const r of row.reports) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        revenue += n(r.total_sales);
        byArea.set(r.area_id, (byArea.get(r.area_id) ?? 0) + n(r.total_sales));
      }
    }
    const areaById = new Map((dataQ.data?.areas ?? []).map((a) => [a.id, a.name]));
    const top = Array.from(byArea.entries()).sort((a, b) => b[1] - a[1])[0];
    return {
      revenue: Math.round(revenue * 100) / 100,
      openBalance: Math.round(openBalance * 100) / 100,
      topArea: top ? { name: areaById.get(top[0]) ?? "—", value: top[1] } : null,
    };
  }, [rows, dataQ.data]);

  const selected = rows.find((r) => r.manager.id === selectedId) ?? null;
  const loading = dataQ.isLoading || weeksQ.isLoading;
  const error = (dataQ.error ?? weeksQ.error) as Error | null;
  const weekLabel = (() => {
    const w = weeks.find((x) => x.week_start === activeWeek);
    return w ? fmtWeekRange(w.week_start, w.week_end) : "No weeks yet";
  })();

  // Duplicate / conflicting manager records (same name or email listed twice).
  const duplicates = useMemo(() => {
    const byKey = new Map<string, number>();
    for (const r of rows) {
      const key = (r.manager.email || r.manager.full_name || "").trim().toLowerCase();
      if (!key) continue;
      byKey.set(key, (byKey.get(key) ?? 0) + 1);
    }
    return Array.from(byKey.entries()).filter(([, c]) => c > 1).map(([k]) => k);
  }, [rows]);

  return (
    <AdminLayout
      title="Area Managers"
      description="Regional managers, teams, and earnings"
      actions={
        <Select
          value={activeWeek ?? ""}
          onValueChange={(v) => setWeek(v)}
          disabled={weeks.length === 0}
        >
          <SelectTrigger className="w-[230px]">
            <SelectValue placeholder="No report weeks" />
          </SelectTrigger>
          <SelectContent>
            {weeks.map((w) => (
              <SelectItem key={w.week_start} value={w.week_start}>
                {fmtWeekRange(w.week_start, w.week_end)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Couldn’t load area managers</p>
            <p className="opacity-80">{error.message}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Active Managers"
          value={loading ? "—" : String(rows.length)}
          hint="Active accounts only"
          icon={Users}
        />
        <StatCard
          label="Managed Revenue"
          value={loading ? "—" : fmtMoney(totals.revenue)}
          hint={weekLabel}
          icon={DollarSign}
        />
        <StatCard
          label="Open Balances"
          value={loading ? "—" : fmtMoney(totals.openBalance)}
          hint="Company owes managers"
          icon={Wallet}
        />
        <StatCard
          label="Top Region"
          value={loading ? "—" : totals.topArea?.name ?? "No data"}
          hint={totals.topArea ? fmtMoney(totals.topArea.value) : weekLabel}
          icon={Crown}
        />
      </div>

      {duplicates.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Duplicate manager accounts detected: {duplicates.join(", ")}. Review them in Users &
            roles.
          </p>
        </div>
      )}

      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex items-center gap-3 border-b p-4">
          <Building2 className="h-5 w-5 text-muted-foreground" />
          <h2 className="font-display text-base font-semibold">Managers</h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading managers…
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            No active area managers found.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Areas</TableHead>
                <TableHead className="text-right">Technicians</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Weekly Earnings</TableHead>
                <TableHead className="text-right">Open Balance</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow
                  key={r.manager.id}
                  onClick={() => setSelectedId(r.manager.id)}
                  className="cursor-pointer"
                >
                  <TableCell className="font-medium">{r.manager.full_name}</TableCell>
                  <TableCell>
                    {r.areas.length === 0 ? (
                      <span className="text-muted-foreground">No area assigned</span>
                    ) : (
                      <span className="inline-flex flex-wrap items-center gap-1.5 text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5" />
                        {r.areas.map((a) => a.name).join(", ")}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="num text-right tabular-nums">{r.techs.length}</TableCell>
                  <TableCell className="num text-right tabular-nums">
                    {r.ratePct === null ? "—" : `${r.ratePct}%`}
                  </TableCell>
                  <TableCell className="num text-right tabular-nums">
                    {activeWeek ? fmtMoney(r.earnings) : "—"}
                  </TableCell>
                  <TableCell
                    className={cn("num text-right font-semibold tabular-nums", moneyClass(r.net))}
                  >
                    {activeWeek ? fmtMoney(r.net) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(r.manager.id);
                      }}
                    >
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="font-display text-xl">
                  {selected.manager.full_name}
                </SheetTitle>
                <SheetDescription>
                  {selected.areas.map((a) => a.name).join(", ") || "No area assigned"} ·{" "}
                  {selected.techs.length} technicians ·{" "}
                  {selected.ratePct === null ? "—" : `${selected.ratePct}%`} profit share
                </SheetDescription>
              </SheetHeader>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg border p-3">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Weekly earnings
                  </p>
                  <p className="num mt-1 font-display text-lg font-semibold tabular-nums">
                    {fmtMoney(selected.earnings)}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Open balance
                  </p>
                  <p
                    className={cn(
                      "num mt-1 font-display text-lg font-semibold tabular-nums",
                      moneyClass(selected.net),
                    )}
                  >
                    {fmtMoney(selected.net)}
                  </p>
                </div>
              </div>

              <Tabs defaultValue="team" className="mt-6">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="team">Team</TabsTrigger>
                  <TabsTrigger value="areas">Areas</TabsTrigger>
                  <TabsTrigger value="reports">Reports</TabsTrigger>
                </TabsList>

                <TabsContent value="team" className="mt-4 space-y-2">
                  {selected.techs.length === 0 ? (
                    <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                      No technicians assigned.
                    </p>
                  ) : (
                    selected.techs.map((t) => {
                      const rep = selected.reports.find((r) => r.technician_id === t.id);
                      return (
                        <div
                          key={t.id}
                          className="flex items-center justify-between rounded-lg border p-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{t.full_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {rep ? `This week: ${fmtMoney(n(rep.total_sales))}` : "No report this week"}
                            </p>
                          </div>
                          {rep && <StatusPill status={rep.status as any} />}
                        </div>
                      );
                    })
                  )}
                </TabsContent>

                <TabsContent value="areas" className="mt-4 space-y-2">
                  {selected.areas.length === 0 ? (
                    <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                      No areas assigned.
                    </p>
                  ) : (
                    selected.areas.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center justify-between rounded-lg border p-3"
                      >
                        <span className="text-sm font-medium">{a.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {n(a.manager_profit_percent)}% profit share
                        </span>
                      </div>
                    ))
                  )}
                </TabsContent>

                <TabsContent value="reports" className="mt-4 space-y-2">
                  {selected.reports.length === 0 ? (
                    <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                      No reports for {weekLabel}.
                    </p>
                  ) : (
                    selected.reports.map((r) => {
                      const tech = selected.techs.find((t) => t.id === r.technician_id);
                      return (
                        <button
                          key={r.id}
                          onClick={() => nav(`/admin/report/${r.id}`)}
                          className="flex w-full items-center justify-between rounded-lg border p-3 text-left transition hover:bg-accent"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {tech?.full_name ?? "Technician"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {fmtWeekRange(r.week_start, r.week_end)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="num text-sm tabular-nums">
                              {fmtMoney(n(r.total_sales))}
                            </span>
                            <StatusPill status={r.status as any} />
                          </div>
                        </button>
                      );
                    })
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>
    </AdminLayout>
  );
}
