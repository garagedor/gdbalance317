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
          <div className="space-y-10">
          {grouped.map(([areaName, rows]) => {
            const areaRows = rows as any[];
            return (
            <section key={areaName} className="animate-fade-in-up">
              {/* Area card */}
              <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
                {/* Section header */}
                <div className="flex items-center justify-between gap-4 border-b bg-muted/30 px-6 py-4">
                  <div className="flex items-center gap-3">
                    <h2 className="text-base font-semibold tracking-tight text-foreground">
                      {areaName}
                    </h2>
                    <span className="rounded-full border bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {areaRows.length} {areaRows.length === 1 ? "report" : "reports"}
                    </span>
                  </div>
                </div>

                {/* Desktop table */}
                <div className="hidden lg:block">
                  <table className="w-full table-fixed border-collapse text-sm">
                    <colgroup>
                      <col className="w-[18%]" />{/* Technician */}
                      <col className="w-[13%]" />{/* Week */}
                      <col className="w-[12%]" />{/* Submitted */}
                      <col className="w-[10%]" />{/* Sales */}
                      <col className="w-[8%]" />{/* Tips */}
                      <col className="w-[9%]" />{/* Card fee */}
                      <col className="w-[14%]" />{/* Balance */}
                      <col className="w-[10%]" />{/* Status */}
                      <col className="w-[6%]" />{/* Action */}
                    </colgroup>
                    <thead>
                      <tr className="border-b bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        <th className="px-4 py-3 text-left">Technician</th>
                        <th className="px-4 py-3 text-left">Week</th>
                        <th className="px-4 py-3 text-left">Submitted</th>
                        <th className="px-4 py-3 text-right">Sales</th>
                        <th className="px-6 py-3 text-right">Tips</th>
                        <th className="px-4 py-3 text-right">Card Fee</th>
                        <th className="px-4 py-3 text-right">Balance</th>
                        <th className="px-4 py-3 text-center">Status</th>
                        <th className="px-4 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {areaRows.map((r) => {
                        const rowAccent =
                          r.status === "Returned"
                            ? "bg-[hsl(var(--status-returned-bg))]/30 hover:bg-[hsl(var(--status-returned-bg))]/50"
                            : r.status === "Submitted"
                            ? "bg-[hsl(var(--status-submitted-bg))]/20 hover:bg-[hsl(var(--status-submitted-bg))]/40"
                            : r.status === "Under Review"
                            ? "bg-[hsl(var(--status-review-bg))]/15 hover:bg-[hsl(var(--status-review-bg))]/30"
                            : "hover:bg-muted/40";
                        const bal = resolveBalance(r.net_balance, r.balance_direction);
                        const balanceLine =
                          bal.direction === "SETTLED"
                            ? "Settled"
                            : bal.labelManager;
                        const balanceClass =
                          bal.tone === "pos"
                            ? "text-emerald-600 dark:text-emerald-400"
                            : bal.tone === "neg"
                            ? "text-destructive"
                            : "text-muted-foreground";
                        return (
                          <tr
                            key={r.id}
                            onClick={() => nav(`/admin/report/${r.id}`)}
                            className={cn(
                              "h-[72px] cursor-pointer align-middle transition-colors",
                              rowAccent,
                            )}
                          >
                            <td className="px-4 py-3">
                              <div className="truncate font-medium text-foreground">
                                {r.technician?.full_name ?? "—"}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-foreground/90">
                              {fmtWeekRange(r.week_start, r.week_end)}
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">
                              {fmtDateTime(r.submitted_at)}
                            </td>
                            <td className="num px-4 py-3 text-right tabular-nums">
                              {fmtMoney(Number(r.total_sales))}
                            </td>
                            <td className="num px-6 py-3 text-right tabular-nums">
                              {fmtMoney(Number(r.total_tips))}
                            </td>
                            <td className="num px-4 py-3 text-right tabular-nums">
                              {fmtMoney(Number(r.total_card_fee))}
                            </td>
                            <td className={cn("px-4 py-3 text-right", balanceClass)}>
                              <div className="num text-sm font-semibold tabular-nums leading-tight">
                                {fmtMoney(bal.amount)}
                              </div>
                              <div className="mt-0.5 truncate text-[10px] font-normal leading-tight opacity-80">
                                {balanceLine}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex justify-center">
                                <StatusPill status={r.status} />
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex justify-end">
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile stacked list */}
                <ul className="divide-y lg:hidden">
                  {areaRows.map((r) => {
                    const rowAccent =
                      r.status === "Returned"
                        ? "bg-[hsl(var(--status-returned-bg))]/30"
                        : r.status === "Submitted"
                        ? "bg-[hsl(var(--status-submitted-bg))]/20"
                        : r.status === "Under Review"
                        ? "bg-[hsl(var(--status-review-bg))]/15"
                        : "";
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
                            "flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/40",
                            rowAccent,
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium">{r.technician?.full_name ?? "—"}</div>
                            <div className="truncate text-xs text-muted-foreground">
                              {fmtWeekRange(r.week_start, r.week_end)}
                            </div>
                            <div className={cn("mt-1 truncate text-xs", balanceClass)}>
                              {balanceLine}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <StatusPill status={r.status} />
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </section>
            );
          })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
