import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAllReports, useAreas, useTechnicians, type AdminFilters } from "@/hooks/useReports";
import { useAuth } from "@/auth/AuthProvider";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusPill } from "@/components/StatusPill";
import { fmtWeekRange, fmtDateTime } from "@/lib/week";
import { fmtMoney, moneyClass } from "@/lib/format";
import { ChevronRight, Loader2, LogOut, MapPin, Search, ShieldCheck, Users } from "lucide-react";
import { cn } from "@/lib/utils";

type TabKey = "pending" | "review" | "verified";

const TAB_TO_STATUS: Record<TabKey, AdminFilters["status"]> = {
  pending: "Submitted",
  review: "Under Review",
  verified: "Approved",
};

export default function AdminHome() {
  const { profile, signOut } = useAuth();
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

  // Group by area for the visual grouping requested in spec
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
    <div className="min-h-dvh bg-background">
      <header className="border-b bg-card/60 backdrop-blur safe-top">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-primary">
              <ShieldCheck className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Management</p>
              <h1 className="font-display text-lg font-semibold leading-tight">Weekly Balance Review</h1>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => nav("/admin/users")} className="gap-1.5">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Users</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => nav("/admin/areas")} className="gap-1.5">
              <MapPin className="h-4 w-4" />
              <span className="hidden sm:inline">Locations</span>
            </Button>
            <span className="mx-2 hidden text-sm text-muted-foreground sm:block">{profile?.full_name}</span>
            <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl space-y-5 px-5 py-5">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="pending">Pending verification</TabsTrigger>
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
          <div className="flex justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : !reports || reports.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center text-muted-foreground">
              No reports match these filters.
            </CardContent>
          </Card>
        ) : (
          grouped.map(([areaName, rows]) => (
            <section key={areaName} className="space-y-2">
              <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{areaName}</h2>
              <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
                <div className="hidden grid-cols-12 gap-3 border-b bg-muted/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground md:grid">
                  <div className="col-span-3">Technician</div>
                  <div className="col-span-2">Week</div>
                  <div className="col-span-2">Submitted</div>
                  <div className="col-span-1 text-right">Sales</div>
                  <div className="col-span-1 text-right">Tips</div>
                  <div className="col-span-1 text-right">Card fee</div>
                  <div className="col-span-1 text-right">Net balance</div>
                  <div className="col-span-1 text-right">Status</div>
                </div>
                <ul>
                  {(rows as any[]).map((r) => (
                    <li key={r.id}>
                      <button
                        onClick={() => nav(`/admin/report/${r.id}`)}
                        className="grid w-full grid-cols-1 items-center gap-2 px-4 py-3 text-left transition hover:bg-muted/50 focus-visible:bg-muted/50 md:grid-cols-12 md:gap-3"
                      >
                        <div className="md:col-span-3">
                          <div className="font-medium">{r.technician?.full_name ?? "—"}</div>
                          <div className="text-xs text-muted-foreground md:hidden">{fmtWeekRange(r.week_start, r.week_end)}</div>
                        </div>
                        <div className="hidden text-sm md:col-span-2 md:block">{fmtWeekRange(r.week_start, r.week_end)}</div>
                        <div className="hidden text-xs text-muted-foreground md:col-span-2 md:block">{fmtDateTime(r.submitted_at)}</div>
                        <div className="num hidden text-right text-sm tabular-nums md:col-span-1 md:block">{fmtMoney(Number(r.total_sales))}</div>
                        <div className="num hidden text-right text-sm tabular-nums md:col-span-1 md:block">{fmtMoney(Number(r.total_tips))}</div>
                        <div className="num hidden text-right text-sm tabular-nums md:col-span-1 md:block">{fmtMoney(Number(r.total_card_fee))}</div>
                        <div className={cn("num hidden text-right text-sm font-semibold tabular-nums md:col-span-1 md:block", moneyClass(Number(r.net_balance)))}>
                          {fmtMoney(Number(r.net_balance))}
                        </div>
                        <div className="flex items-center justify-between md:col-span-1 md:justify-end">
                          <div className="md:hidden">
                            <div className="num text-sm font-semibold">{fmtMoney(Number(r.total_sales))} <span className="text-muted-foreground">·</span> <span className={moneyClass(Number(r.net_balance))}>{fmtMoney(Number(r.net_balance))}</span></div>
                          </div>
                          <div className="flex items-center gap-2">
                            <StatusPill status={r.status} />
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ))
        )}
      </main>
    </div>
  );
}
