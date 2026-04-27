import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAllReports, useAreas, useTechnicians, type AdminFilters } from "@/hooks/useReports";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusPill } from "@/components/StatusPill";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { fmtWeekRange, fmtDateTime } from "@/lib/week";
import { fmtMoney, moneyClass, resolveBalance } from "@/lib/format";
import { ChevronRight, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";

type TabKey = "pending" | "review" | "verified";

const TAB_TO_STATUS: Record<TabKey, AdminFilters["status"]> = {
  pending: "Submitted",
  review: "Under Review",
  verified: "Approved",
};

export default function AdminHome() {
  const nav = useNavigate();
  const [tab, setTab] = useState<TabKey>("pending");
  const [filters, setFilters] = useState<Omit<AdminFilters, "status">>({
    area_id: "all",
    technician_id: "all",
    week_start: null,
    search: "",
  });

  const statusFilter: AdminFilters["status"] = TAB_TO_STATUS[tab];

  const { data: reports, isLoading } = useAllReports({ ...filters, status: statusFilter });
  const { data: areas } = useAreas();
  const { data: techs } = useTechnicians();

  const grouped = useMemo(() => {
    const map = new Map<string, typeof reports extends Array<infer T> ? T[] : never>();
    (reports ?? []).forEach((r) => {
      const key = r.area?.name ?? "Unassigned";
      const arr = (map.get(key) as any[] | undefined) ?? [];
      arr.push(r);
      map.set(key, arr as never);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [reports]);

  return (
    <AdminLayout title="Reports" description="Weekly balance review across all technicians">
      <div className="space-y-5">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList className="grid w-full max-w-xl grid-cols-3">
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="review">Under Review</TabsTrigger>
            <TabsTrigger value="verified">Verified</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Filters */}
        <Card>
          <CardContent className="grid grid-cols-1 gap-3 p-4 md:grid-cols-5">
            <div className="relative md:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by tech or area"
                className="pl-9"
                value={filters.search}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              />
            </div>
            <Select value={filters.area_id ?? "all"} onValueChange={(v) => setFilters((f) => ({ ...f, area_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Area" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All areas</SelectItem>
                {(areas ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.technician_id ?? "all"} onValueChange={(v) => setFilters((f) => ({ ...f, technician_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Technician" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All technicians</SelectItem>
                {(techs ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={filters.week_start ?? ""}
              onChange={(e) => setFilters((f) => ({ ...f, week_start: e.target.value || null }))}
              aria-label="Week start"
            />
          </CardContent>
        </Card>

        {/* List */}
        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-14 w-full rounded-xl shimmer" />
            ))}
          </div>
        ) : !reports || reports.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center text-muted-foreground">
              No reports match these filters.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
          {grouped.map(([areaName, rows]) => (
            <section key={areaName} className="space-y-3 animate-fade-in-up">
              <h2 className="px-1 pt-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {areaName}
              </h2>
              <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
                {/* Header — desktop only. Grid totals to 16 columns for room. */}
                <div className="hidden grid-cols-16 gap-4 border-b bg-muted/50 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground lg:grid">
                  <div className="col-span-4">Technician</div>
                  <div className="col-span-2">Week</div>
                  <div className="col-span-2">Submitted</div>
                  <div className="col-span-1 text-right">Sales</div>
                  <div className="col-span-1 text-right">Tips</div>
                  <div className="col-span-2 text-right">Card fee</div>
                  <div className="col-span-2 text-right">Balance</div>
                  <div className="col-span-2 text-right">Status</div>
                </div>
                <ul className="divide-y">
                  {(rows as any[]).map((r) => {
                    const rowAccent =
                      r.status === "Returned"
                        ? "bg-[hsl(var(--status-returned-bg))]/40 hover:bg-[hsl(var(--status-returned-bg))]/60"
                        : r.status === "Submitted"
                        ? "bg-[hsl(var(--status-submitted-bg))]/30 hover:bg-[hsl(var(--status-submitted-bg))]/50"
                        : r.status === "Under Review"
                        ? "bg-[hsl(var(--status-review-bg))]/20 hover:bg-[hsl(var(--status-review-bg))]/40"
                        : r.status === "Approved"
                        ? "hover:bg-[hsl(var(--status-approved-bg))]/40"
                        : "hover:bg-muted/50";
                    const bal = resolveBalance(r.net_balance, r.balance_direction);
                    const balanceLine =
                      bal.direction === "SETTLED"
                        ? `Settled: ${fmtMoney(0)}`
                        : `${bal.labelManager}: ${fmtMoney(bal.amount)}`;
                    const balanceClass =
                      bal.tone === "pos"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : bal.tone === "neg"
                        ? "text-destructive"
                        : "text-muted-foreground";
                    return (
                      <li key={r.id}>
                        <button
                          onClick={() => nav(`/admin/report/${r.id}`)}
                          className={cn(
                            "grid w-full min-h-[64px] grid-cols-1 items-center gap-x-4 gap-y-2 px-5 py-4 text-left transition-colors focus-visible:bg-muted/50 lg:min-h-[72px] lg:grid-cols-16 lg:gap-y-0",
                            rowAccent,
                          )}
                        >
                          {/* Technician */}
                          <div className="min-w-0 lg:col-span-4">
                            <div className="truncate font-medium">{r.technician?.full_name ?? "—"}</div>
                            <div className="truncate text-xs text-muted-foreground lg:hidden">
                              {fmtWeekRange(r.week_start, r.week_end)}
                            </div>
                          </div>

                          {/* Week (desktop) */}
                          <div className="hidden text-sm lg:col-span-2 lg:block">
                            {fmtWeekRange(r.week_start, r.week_end)}
                          </div>

                          {/* Submitted (desktop) */}
                          <div className="hidden text-xs text-muted-foreground lg:col-span-2 lg:block">
                            {fmtDateTime(r.submitted_at)}
                          </div>

                          {/* Sales */}
                          <div className="num hidden text-right text-sm tabular-nums lg:col-span-1 lg:block">
                            {fmtMoney(Number(r.total_sales))}
                          </div>

                          {/* Tips */}
                          <div className="num hidden text-right text-sm tabular-nums lg:col-span-1 lg:block">
                            {fmtMoney(Number(r.total_tips))}
                          </div>

                          {/* Card fee */}
                          <div className="num hidden text-right text-sm tabular-nums lg:col-span-2 lg:block">
                            {fmtMoney(Number(r.total_card_fee))}
                          </div>

                          {/* Balance — amount on top, direction subtext on its own line */}
                          <div
                            className={cn(
                              "hidden min-w-0 text-right lg:col-span-2 lg:block",
                              balanceClass,
                            )}
                            title={balanceLine}
                          >
                            <div className="num text-sm font-semibold tabular-nums">
                              {fmtMoney(bal.amount)}
                            </div>
                            <div className="mt-0.5 truncate text-[10px] font-normal leading-tight opacity-80">
                              {balanceLine}
                            </div>
                          </div>

                          {/* Status + chevron — kept on its own column with breathing room */}
                          <div className="flex items-center justify-between gap-3 lg:col-span-2 lg:justify-end">
                            <div className="min-w-0 lg:hidden">
                              <div className="num text-sm font-semibold tabular-nums">
                                {fmtMoney(Number(r.total_sales))}
                              </div>
                              <div className={cn("mt-0.5 truncate text-xs", balanceClass)}>
                                {balanceLine}
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <StatusPill status={r.status} />
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </section>
          ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
