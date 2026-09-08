import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAllReports, useTechnicians } from "@/hooks/useReports";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusPill } from "@/components/StatusPill";
import { fmtWeekRange } from "@/lib/week";
import { fmtMoney, resolveBalance } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowRight,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  Clock,
  Filter,
  Receipt,
  Users,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const n = (v: unknown) => Number(v ?? 0) || 0;

export default function AdminDashboard() {
  const nav = useNavigate();
  const { data: reports, isLoading } = useAllReports({ status: "all" });
  const { data: techs } = useTechnicians();

  const [weekFilter, setWeekFilter] = useState<string>("latest");
  const [areaFilter, setAreaFilter] = useState<string>("all");
  const [techFilter, setTechFilter] = useState<string>("all");

  const allRows = useMemo(() => reports ?? [], [reports]);

  const rows = useMemo(
    () =>
      allRows.filter(
        (r) =>
          (areaFilter === "all" || r.area?.id === areaFilter) &&
          (techFilter === "all" || r.technician?.id === techFilter),
      ),
    [allRows, areaFilter, techFilter],
  );

  const weekOptions = useMemo(
    () =>
      Array.from(new Set(allRows.map((r) => r.week_start))).sort((a, b) =>
        b.localeCompare(a),
      ),
    [allRows],
  );

  const areaOptions = useMemo(() => {
    const map = new Map<string, string>();
    allRows.forEach((r) => {
      if (r.area?.id) map.set(r.area.id, r.area.name ?? "Unassigned");
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [allRows]);

  const currentWeek = useMemo(() => {
    if (!rows.length) return null;
    return rows.reduce((max, r) => (r.week_start > max ? r.week_start : max), rows[0].week_start);
  }, [rows]);

  const selectedWeek = weekFilter === "latest" ? currentWeek : weekFilter;

  const weekRows = useMemo(
    () => rows.filter((r) => r.week_start === selectedWeek),
    [rows, selectedWeek],
  );

  const counts = useMemo(() => {
    const by = (s: string) => rows.filter((r) => r.status === s).length;
    return {
      submitted: by("Submitted"),
      review: by("Under Review"),
      returned: by("Returned"),
      approved: by("Approved"),
      draft: by("Draft"),
    };
  }, [rows]);

  const weekTotals = useMemo(() => {
    return weekRows.reduce(
      (acc, r) => {
        acc.sales += n(r.total_sales);
        acc.tips += n(r.total_tips);
        acc.fee += n(r.total_card_fee);
        acc.balance += n(r.net_balance);
        return acc;
      },
      { sales: 0, tips: 0, fee: 0, balance: 0 },
    );
  }, [weekRows]);

  const trend = useMemo(() => {
    const map = new Map<string, { week: string; sales: number; tips: number }>();
    rows.forEach((r) => {
      const cur = map.get(r.week_start) ?? { week: r.week_start, sales: 0, tips: 0 };
      cur.sales += n(r.total_sales);
      cur.tips += n(r.total_tips);
      map.set(r.week_start, cur);
    });
    return Array.from(map.values())
      .sort((a, b) => a.week.localeCompare(b.week))
      .slice(-8)
      .map((d) => ({ ...d, label: d.week.slice(5) }));
  }, [rows]);

  const topTechs = useMemo(() => {
    const map = new Map<string, { name: string; sales: number; reports: number }>();
    weekRows.forEach((r) => {
      const id = r.technician?.id ?? "unknown";
      const cur = map.get(id) ?? { name: r.technician?.full_name ?? "—", sales: 0, reports: 0 };
      cur.sales += n(r.total_sales);
      cur.reports += 1;
      map.set(id, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.sales - a.sales).slice(0, 5);
  }, [weekRows]);

  const needsAction = useMemo(
    () =>
      rows
        .filter((r) => r.status === "Submitted" || r.status === "Under Review")
        .slice(0, 6),
    [rows],
  );

  const activeTechs = (techs ?? []).filter((t) => t.is_active).length;
  const submittedThisWeek = weekRows.filter((r) => r.status !== "Draft").length;

  return (
    <AdminLayout title="Dashboard" description="Live overview of this week's activity">
      <div className="space-y-5">
        {/* Action center */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <ActionTile
            label="Waiting for review"
            value={counts.submitted}
            icon={Clock}
            tone={counts.submitted > 0 ? "warn" : "muted"}
            onClick={() => nav("/admin/reports?tab=pending")}
          />
          <ActionTile
            label="Under review"
            value={counts.review}
            icon={ClipboardCheck}
            tone="info"
            onClick={() => nav("/admin/reports?tab=review")}
          />
          <ActionTile
            label="Returned to techs"
            value={counts.returned}
            icon={AlertTriangle}
            tone={counts.returned > 0 ? "danger" : "muted"}
            onClick={() => nav("/admin/reports?tab=returned")}
          />
          <ActionTile
            label="Verified"
            value={counts.approved}
            icon={ClipboardCheck}
            tone="success"
            onClick={() => nav("/admin/reports?tab=verified")}
          />
        </div>

        {/* Current week KPIs */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
              <span>
                Current week
                {currentWeek && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {fmtWeekRange(currentWeek, currentWeek)}
                  </span>
                )}
              </span>
              <span className="text-xs font-normal text-muted-foreground">
                {submittedThisWeek} of {activeTechs || "—"} technicians reported
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Sales" value={fmtMoney(weekTotals.sales)} icon={CircleDollarSign} />
            <Kpi label="Tips" value={fmtMoney(weekTotals.tips)} icon={Receipt} />
            <Kpi label="Card fees" value={fmtMoney(weekTotals.fee)} icon={Receipt} />
            <Kpi label="Net balance" value={fmtMoney(weekTotals.balance)} icon={Users} />
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Trend */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Sales trend · last 8 weeks</CardTitle>
            </CardHeader>
            <CardContent className="h-[240px]">
              {isLoading || trend.length === 0 ? (
                <div className="h-full w-full rounded-xl shimmer" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                    <YAxis tickLine={false} axisLine={false} fontSize={11} width={60} />
                    <Tooltip
                      formatter={(v: number) => fmtMoney(v)}
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 12,
                        fontSize: 12,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="sales"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      fill="url(#salesFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Top technicians */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Top technicians this week</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {topTechs.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No activity yet.</p>
              ) : (
                topTechs.map((t, i) => (
                  <div key={t.name + i} className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
                        {i + 1}
                      </span>
                      <span className="truncate text-sm font-medium">{t.name}</span>
                    </div>
                    <span className="num shrink-0 text-sm font-semibold tabular-nums">
                      {fmtMoney(t.sales)}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Needs your attention */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base">Needs your attention</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => nav("/admin/reports?tab=pending")}>
              All reports <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-12 w-full rounded-xl shimmer" />
                ))}
              </div>
            ) : needsAction.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Nothing waiting — everything is reviewed.
              </p>
            ) : (
              <ul className="divide-y">
                {needsAction.map((r) => {
                  const bal = resolveBalance(r.net_balance, r.balance_direction);
                  return (
                    <li key={r.id}>
                      <button
                        onClick={() => nav(`/admin/report/${r.id}`)}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">
                            {r.technician?.full_name ?? "—"}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {fmtWeekRange(r.week_start, r.week_end)} · {r.area?.name ?? "Unassigned"}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="num hidden text-sm font-semibold tabular-nums sm:block">
                            {fmtMoney(bal.amount)}
                          </span>
                          <StatusPill status={r.status} />
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}

function Kpi({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-2xl border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="num mt-1.5 font-display text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function ActionTile({
  label,
  value,
  icon: Icon,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone: "warn" | "info" | "danger" | "success" | "muted";
  onClick: () => void;
}) {
  const toneCls: Record<string, string> = {
    warn: "border-[hsl(var(--status-submitted-fg))]/30 bg-[hsl(var(--status-submitted-bg))]/40",
    info: "border-[hsl(var(--status-review-fg,var(--border)))]/30 bg-muted/40",
    danger: "border-destructive/30 bg-destructive/5",
    success: "border-[hsl(var(--status-approved-fg))]/30 bg-[hsl(var(--status-approved-bg))]/40",
    muted: "bg-card",
  };
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-2xl border p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
        toneCls[tone],
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="num mt-2 font-display text-2xl font-bold tabular-nums">{value}</div>
    </button>
  );
}
