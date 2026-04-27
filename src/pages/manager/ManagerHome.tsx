import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { useMyTechnicians, useManagedReports } from "@/hooks/useManager";
import { useMyReports } from "@/hooks/useReports";
import { useMyAreas } from "@/hooks/useUserAreas";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { todayInTimezone } from "@/lib/week";
import { ManagerLayout } from "@/components/manager/ManagerLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { StatusPill } from "@/components/StatusPill";
import { fmtWeekRange, fmtDateTime } from "@/lib/week";
import { fmtMoney, moneyClass, resolveBalance } from "@/lib/format";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronRight,
  ClipboardList,
  HourglassIcon,
  Loader2,
  MapPin,
  Plus,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Section = "dashboard" | "team" | "mine" | "balance" | "technicians" | "areas";
type TeamTab = "pending" | "approved" | "payments";

function sectionFromPath(pathname: string): Section {
  // Accept both /manager/* (canonical) and /area-manager/* (alias).
  if (pathname.startsWith("/manager/team") || pathname.startsWith("/area-manager/team-reports")) return "team";
  if (pathname.startsWith("/manager/mine") || pathname.startsWith("/area-manager/my-reports")) return "mine";
  if (pathname.startsWith("/manager/balance") || pathname.startsWith("/area-manager/my-weekly-balance")) return "balance";
  if (pathname.startsWith("/manager/technicians") || pathname.startsWith("/area-manager/technicians")) return "technicians";
  if (pathname.startsWith("/manager/areas") || pathname.startsWith("/area-manager/areas")) return "areas";
  return "dashboard";
}

function sectionTitle(s: Section): { title: string; description: string } {
  switch (s) {
    case "team": return { title: "Team Reports", description: "Reports & balances for technicians under you." };
    case "mine": return { title: "My Reports", description: "Personal weekly reports for jobs you performed (40% commission)." };
    case "balance": return { title: "My Weekly Balance", description: "Your own weekly net balance — your jobs only." };
    case "technicians": return { title: "Technicians", description: "Technicians assigned to you." };
    case "areas": return { title: "Area Settings", description: "Locations you manage." };
    default: return { title: "Dashboard", description: "Overview of your team and personal reports." };
  }
}

export default function ManagerHome() {
  const { profile } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const qc = useQueryClient();
  const section = sectionFromPath(loc.pathname);
  const meta = sectionTitle(section);

  // Allow deep-linking team subtabs via ?tab=pending|approved|payments
  // (used by mobile unified-section dropdown in ManagerLayout).
  const initialTeamTab = ((): TeamTab => {
    const t = new URLSearchParams(loc.search).get("tab");
    return t === "approved" || t === "payments" ? t : "pending";
  })();
  const [teamTab, setTeamTab] = useState<TeamTab>(initialTeamTab);

  // Keep teamTab in sync when the URL ?tab= changes (e.g. mobile dropdown nav).
  useMemo(() => {
    if (section === "team") setTeamTab(initialTeamTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.search, section]);
  const [creating, setCreating] = useState(false);
  const [pickAreaOpen, setPickAreaOpen] = useState(false);
  const [pickedAreaId, setPickedAreaId] = useState<string | null>(null);

  const { data: techs, isLoading: techsLoading } = useMyTechnicians();
  const { data: reports, isLoading: reportsLoading } = useManagedReports();
  const { data: myReports, isLoading: myReportsLoading } = useMyReports();
  const { data: myAreaRows } = useMyAreas();

  const { data: myAreas } = useQuery({
    enabled: !!myAreaRows,
    queryKey: ["my-areas-resolved", (myAreaRows ?? []).map((r) => r.area_id).join(",")],
    queryFn: async () => {
      const ids = Array.from(
        new Set([
          ...((myAreaRows ?? []).map((r) => r.area_id)),
          ...(profile?.area_id ? [profile.area_id] : []),
        ]),
      );
      if (ids.length === 0) return [] as Array<{ id: string; name: string; timezone: string; is_primary: boolean }>;
      const { data, error } = await supabase
        .from("areas")
        .select("id, name, timezone")
        .in("id", ids)
        .order("name");
      if (error) throw error;
      const primary =
        (myAreaRows ?? []).find((r) => r.is_primary)?.area_id ?? profile?.area_id ?? null;
      return (data ?? []).map((a) => ({ ...a, is_primary: a.id === primary }));
    },
  });

  const createReportForArea = async (areaId: string) => {
    if (!profile) return;
    setCreating(true);
    try {
      const { data: area, error: aErr } = await supabase
        .from("areas")
        .select("id, timezone")
        .eq("id", areaId)
        .maybeSingle();
      if (aErr) throw aErr;
      const today = todayInTimezone(area?.timezone);
      const d = new Date(today + "T00:00:00");
      const isoDow = ((d.getUTCDay() + 6) % 7) + 1;
      const start = new Date(d);
      start.setUTCDate(d.getUTCDate() - (isoDow - 1));
      const end = new Date(start);
      end.setUTCDate(start.getUTCDate() + 6);
      const ws = start.toISOString().slice(0, 10);
      const we = end.toISOString().slice(0, 10);

      const existing = (myReports ?? []).find(
        (r) => r.week_start === ws && (r as any).area_id === areaId,
      );
      if (existing) {
        nav(`/tech/report/${existing.id}`);
        return;
      }
      const { data, error } = await supabase
        .from("weekly_reports")
        .insert({
          technician_id: profile.id,
          area_id: areaId,
          week_start: ws,
          week_end: we,
          status: "Draft",
        })
        .select("id")
        .single();
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["my-reports"] });
      nav(`/tech/report/${data.id}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not create report");
    } finally {
      setCreating(false);
    }
  };

  const handleNewMyReport = () => {
    const assigned = myAreas ?? [];
    if (assigned.length === 0 && !profile?.area_id) {
      toast.error("Your account is not assigned to an area. Ask an admin.");
      return;
    }
    if (assigned.length > 1) {
      setPickedAreaId(assigned.find((a) => a.is_primary)?.id ?? assigned[0].id);
      setPickAreaOpen(true);
      return;
    }
    const onlyId = assigned[0]?.id ?? profile!.area_id!;
    void createReportForArea(onlyId);
  };

  const stats = useMemo(() => {
    const list = reports ?? [];
    const pending = list.filter((r) => ["Submitted", "Under Review", "Returned"].includes(r.status));
    const approved = list.filter((r) => r.status === "Approved");
    const openApproved = approved.filter((r) => r.balance_payment_status !== "settled");
    const companyOwes = openApproved
      .filter((r) => resolveBalance(Number(r.net_balance), r.balance_direction).direction === "COMPANY_OWES_TECH")
      .reduce((acc, r) => acc + Math.max(resolveBalance(Number(r.net_balance), r.balance_direction).amount - Number(r.amount_transferred), 0), 0);
    const techsOwe = openApproved
      .filter((r) => resolveBalance(Number(r.net_balance), r.balance_direction).direction === "TECH_OWES_COMPANY")
      .reduce((acc, r) => acc + Math.max(resolveBalance(Number(r.net_balance), r.balance_direction).amount - Number(r.amount_transferred), 0), 0);
    const openCount = approved.filter((r) => r.balance_payment_status !== "settled").length;
    return {
      assigned: techs?.length ?? 0,
      pending: pending.length,
      approved: approved.length,
      companyOwes,
      techsOwe,
      openCount,
    };
  }, [techs, reports]);

  const myWeeklyBalance = useMemo(() => {
    const list = myReports ?? [];
    const totalSales = list.reduce((a, r) => a + Number(r.total_sales || 0), 0);
    const totalTips = list.reduce((a, r) => a + Number(r.total_tips || 0), 0);
    const open = list.filter((r) => r.status === "Approved" && r.balance_payment_status !== "settled");
    const owed = open
      .filter((r) => resolveBalance(Number(r.net_balance), (r as any).balance_direction).direction === "COMPANY_OWES_TECH")
      .reduce((a, r) => a + Math.max(resolveBalance(Number(r.net_balance), (r as any).balance_direction).amount - Number(r.amount_transferred || 0), 0), 0);
    const owe = open
      .filter((r) => resolveBalance(Number(r.net_balance), (r as any).balance_direction).direction === "TECH_OWES_COMPANY")
      .reduce((a, r) => a + Math.max(resolveBalance(Number(r.net_balance), (r as any).balance_direction).amount - Number(r.amount_transferred || 0), 0), 0);
    return {
      count: list.length,
      totalSales,
      totalTips,
      owed,
      owe,
    };
  }, [myReports]);

  const teamReports = useMemo(() => {
    const list = reports ?? [];
    if (teamTab === "pending") return list.filter((r) => ["Submitted", "Under Review", "Returned"].includes(r.status));
    if (teamTab === "approved") return list.filter((r) => r.status === "Approved");
    return list.filter((r) => r.status === "Approved" && r.balance_payment_status !== "settled");
  }, [reports, teamTab]);

  const headerActions = section === "mine" || section === "balance" ? (
    <Button onClick={handleNewMyReport} disabled={creating} size="sm" className="gap-2">
      {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
      New report
    </Button>
  ) : undefined;

  return (
    <ManagerLayout title={meta.title} description={meta.description} actions={headerActions}>
      {/* Pick area dialog (only shown when AM has 2+ assigned areas) */}
      <Dialog open={pickAreaOpen} onOpenChange={setPickAreaOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-4 w-4" /> Choose location
            </DialogTitle>
            <DialogDescription>
              You're assigned to multiple locations. Pick the one this report covers.
            </DialogDescription>
          </DialogHeader>
          <RadioGroup value={pickedAreaId ?? ""} onValueChange={setPickedAreaId} className="space-y-1">
            {(myAreas ?? []).map((a) => (
              <Label
                key={a.id}
                htmlFor={`area-${a.id}`}
                className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 hover:bg-muted/50"
              >
                <RadioGroupItem id={`area-${a.id}`} value={a.id} />
                <span className="flex-1 text-sm font-medium">{a.name}</span>
                {a.is_primary && (
                  <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                    Home
                  </span>
                )}
              </Label>
            ))}
          </RadioGroup>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPickAreaOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button
              disabled={!pickedAreaId || creating}
              onClick={async () => {
                if (!pickedAreaId) return;
                setPickAreaOpen(false);
                await createReportForArea(pickedAreaId);
              }}
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {section === "dashboard" && (
        <>
          <section className="grid grid-cols-2 gap-3 animate-fade-in-up md:grid-cols-3 lg:grid-cols-6">
            <SummaryCard icon={Users} label="Assigned techs" value={stats.assigned} loading={techsLoading} tone="info" />
            <SummaryCard icon={HourglassIcon} label="Pending reports" value={stats.pending} loading={reportsLoading} tone="warning" />
            <SummaryCard icon={ClipboardList} label="Approved" value={stats.approved} loading={reportsLoading} tone="success" />
            <SummaryCard icon={ArrowDownLeft} label="Company owes techs" value={fmtMoney(stats.companyOwes)} loading={reportsLoading} tone="danger" />
            <SummaryCard icon={ArrowUpRight} label="Techs owe company" value={fmtMoney(stats.techsOwe)} loading={reportsLoading} tone="success" />
            <SummaryCard icon={Wallet} label="Open balances" value={stats.openCount} loading={reportsLoading} tone={stats.openCount > 0 ? "warning" : "neutral"} />
          </section>

          <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Card className="cursor-pointer transition hover:shadow-md" onClick={() => nav("/manager/team")}>
              <CardContent className="flex items-center justify-between gap-3 p-5">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Team Reports</div>
                  <div className="font-display text-lg font-semibold">{stats.pending} pending · {stats.approved} approved</div>
                  <div className="text-xs text-muted-foreground">Review and track payouts for your technicians.</div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>
            <Card className="cursor-pointer transition hover:shadow-md" onClick={() => nav("/manager/mine")}>
              <CardContent className="flex items-center justify-between gap-3 p-5">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-accent">My Reports · 40%</div>
                  <div className="font-display text-lg font-semibold">{(myReports ?? []).length} personal reports</div>
                  <div className="text-xs text-muted-foreground">Submit your own jobs and track your weekly balance.</div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>
          </section>
        </>
      )}

      {section === "team" && (
        <>
          {/* Mobile: dropdown — avoids cramped tabs on iPhone widths. */}
          <div className="sm:hidden">
            <Select value={teamTab} onValueChange={(v) => setTeamTab(v as TeamTab)}>
              <SelectTrigger className="h-11 w-full text-sm font-medium" aria-label="Select team report view">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-50 w-[--radix-select-trigger-width] bg-popover">
                <SelectItem value="pending" className="py-2.5">Pending</SelectItem>
                <SelectItem value="approved" className="py-2.5">Approved</SelectItem>
                <SelectItem value="payments" className="py-2.5">Payment Tracking</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Tablet/desktop: keep tabs. */}
          <Tabs
            value={teamTab}
            onValueChange={(v) => setTeamTab(v as TeamTab)}
            className="hidden sm:block"
          >
            <TabsList className="grid w-full max-w-2xl grid-cols-3">
              <TabsTrigger value="pending">Pending</TabsTrigger>
              <TabsTrigger value="approved">Approved</TabsTrigger>
              <TabsTrigger value="payments">Payment Tracking</TabsTrigger>
            </TabsList>
          </Tabs>

          {reportsLoading ? (
            <Loader />
          ) : teamReports.length === 0 ? (
            <EmptyCard text="Nothing here yet." />
          ) : (
            <ReportList reports={teamReports} onOpen={(id) => nav(`/manager/report/${id}`)} />
          )}
        </>
      )}

      {section === "mine" && (
        <MyReportsPanel
          loading={myReportsLoading}
          reports={myReports ?? []}
          creating={creating}
          onOpen={(id) => nav(`/tech/report/${id}`)}
          onCreate={handleNewMyReport}
        />
      )}

      {section === "balance" && (
        <MyBalancePanel
          loading={myReportsLoading}
          summary={myWeeklyBalance}
          reports={myReports ?? []}
          onOpen={(id) => nav(`/tech/report/${id}`)}
        />
      )}

      {section === "technicians" && (
        techsLoading ? <Loader /> : !techs || techs.length === 0 ? (
          <EmptyCard text="You don't have any technicians assigned yet. Ask an admin to assign technicians to you." />
        ) : (
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y">
                {techs.map((t) => {
                  const techReports = (reports ?? []).filter((r) => r.technician_id === t.id);
                  const open = techReports.filter(
                    (r) => r.status === "Approved" && r.balance_payment_status !== "settled",
                  ).length;
                  return (
                    <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
                          {t.full_name?.charAt(0)?.toUpperCase() ?? "?"}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium">{t.full_name}</div>
                          <div className="truncate text-xs text-muted-foreground">{t.email}</div>
                        </div>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <div>{techReports.length} reports</div>
                        {open > 0 && (
                          <div className="font-semibold text-[hsl(var(--status-returned-fg))]">
                            {open} open
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        )
      )}

      {section === "areas" && (
        !myAreas || myAreas.length === 0 ? (
          <EmptyCard text="You're not assigned to any area yet. Ask an admin." />
        ) : (
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y">
                {myAreas.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/15 text-accent">
                        <MapPin className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="font-medium">{a.name}</div>
                        <div className="text-xs text-muted-foreground">Timezone: {a.timezone}</div>
                      </div>
                    </div>
                    {a.is_primary && (
                      <span className="rounded bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                        Primary
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )
      )}
    </ManagerLayout>
  );
}

function ReportList({
  reports,
  onOpen,
}: {
  reports: any[];
  onOpen: (id: string) => void;
}) {
  return (
    <ul className="space-y-3">
      {reports.map((r, idx) => {
        const balanceCls = moneyClass(Number(r.net_balance));
        const remaining = Math.max(Math.abs(Number(r.net_balance)) - Number(r.amount_transferred), 0);
        const accentBar =
          r.status === "Returned"
            ? "bg-[hsl(var(--status-returned-fg))]"
            : r.status === "Submitted" || r.status === "Under Review"
            ? "bg-[hsl(var(--status-submitted-fg))]"
            : r.status === "Approved"
            ? "bg-[hsl(var(--status-approved-fg))]"
            : "bg-muted-foreground/30";
        return (
          <li
            key={r.id}
            className="animate-fade-in-up"
            style={{ animationDelay: `${idx * 30}ms`, animationFillMode: "backwards" }}
          >
            <button
              onClick={() => onOpen(r.id)}
              className="group relative block w-full overflow-hidden rounded-2xl border bg-card p-4 pl-5 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className={cn("absolute inset-y-3 left-2 w-1 rounded-full", accentBar)} />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-display text-base font-semibold">{r.technician?.full_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.area?.name ?? "—"} · {fmtWeekRange(r.week_start, r.week_end)}
                  </div>
                  {r.submitted_at && (
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      Submitted {fmtDateTime(r.submitted_at)}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill status={r.status} />
                  <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
                </div>
              </div>
              <div className="num mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Sales" value={fmtMoney(Number(r.total_sales))} />
                <Stat label="Tips" value={fmtMoney(Number(r.total_tips))} />
                <Stat label="Net balance" value={fmtMoney(Number(r.net_balance))} cls={balanceCls} />
                {r.status === "Approved" ? (
                  <Stat
                    label="Remaining"
                    value={fmtMoney(remaining)}
                    cls={
                      r.balance_payment_status === "settled"
                        ? "text-[hsl(var(--status-approved-fg))]"
                        : r.balance_payment_status === "partial"
                        ? "text-[hsl(var(--status-submitted-fg))]"
                        : "text-[hsl(var(--status-returned-fg))]"
                    }
                  />
                ) : (
                  <Stat label="Card fee" value={fmtMoney(Number(r.total_card_fee))} />
                )}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  loading,
  tone = "neutral",
}: {
  icon: any;
  label: string;
  value: number | string;
  loading?: boolean;
  tone?: "neutral" | "info" | "success" | "warning" | "danger";
}) {
  const styles: Record<string, { wrap: string; iconWrap: string; valueCls: string }> = {
    neutral: {
      wrap: "bg-card border-border",
      iconWrap: "bg-muted text-muted-foreground",
      valueCls: "text-foreground",
    },
    info: {
      wrap: "bg-[hsl(var(--status-review-bg))] border-[hsl(var(--status-review-fg))]/20",
      iconWrap: "bg-[hsl(var(--status-review-fg))]/15 text-[hsl(var(--status-review-fg))]",
      valueCls: "text-[hsl(var(--status-review-fg))]",
    },
    success: {
      wrap: "bg-[hsl(var(--status-approved-bg))] border-[hsl(var(--status-approved-fg))]/20",
      iconWrap: "bg-[hsl(var(--status-approved-fg))]/15 text-[hsl(var(--status-approved-fg))]",
      valueCls: "text-[hsl(var(--status-approved-fg))]",
    },
    warning: {
      wrap: "bg-[hsl(var(--status-submitted-bg))] border-[hsl(var(--status-submitted-fg))]/20",
      iconWrap: "bg-[hsl(var(--status-submitted-fg))]/15 text-[hsl(var(--status-submitted-fg))]",
      valueCls: "text-[hsl(var(--status-submitted-fg))]",
    },
    danger: {
      wrap: "bg-[hsl(var(--status-returned-bg))] border-[hsl(var(--status-returned-fg))]/20",
      iconWrap: "bg-[hsl(var(--status-returned-fg))]/15 text-[hsl(var(--status-returned-fg))]",
      valueCls: "text-[hsl(var(--status-returned-fg))]",
    },
  };
  const s = styles[tone];
  return (
    <div className={cn("group rounded-2xl border p-3.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md", s.wrap)}>
      <div className="flex items-center gap-3">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl ring-1 ring-current/10 transition-transform group-hover:scale-105", s.iconWrap)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider opacity-70">{label}</div>
          <div className={cn("num font-display text-lg font-bold tabular-nums leading-tight", s.valueCls)}>
            {loading ? "—" : value}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 text-sm font-bold tabular-nums", cls)}>{value}</div>
    </div>
  );
}

function Loader() {
  return (
    <div className="flex justify-center py-16 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <Card className="border-dashed">
      <CardContent className="py-12 text-center text-sm text-muted-foreground">{text}</CardContent>
    </Card>
  );
}

function MyReportsPanel({
  loading,
  reports,
  creating,
  onOpen,
  onCreate,
}: {
  loading: boolean;
  reports: Array<{
    id: string;
    week_start: string;
    week_end: string;
    status: string;
    total_sales: number | string;
    total_tips: number | string;
    net_balance: number | string;
  }>;
  creating: boolean;
  onOpen: (id: string) => void;
  onCreate: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border bg-accent/5 p-4 text-sm">
        <div className="font-display text-sm font-semibold text-accent">Personal jobs · 40% commission</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Use this section to report jobs you personally performed. Your team reports stay separate.
        </p>
      </div>

      {loading ? (
        <Loader />
      ) : reports.length === 0 ? (
        <div className="space-y-3">
          <EmptyCard text="No personal reports yet. Click 'New report' (top right) to start one for this week." />
          <div className="flex justify-center">
            <Button onClick={onCreate} disabled={creating} className="gap-2">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              New report
            </Button>
          </div>
        </div>
      ) : (
        <ul className="space-y-3">
          {reports.map((r) => {
            const balanceCls = moneyClass(Number(r.net_balance));
            return (
              <li key={r.id}>
                <button
                  onClick={() => onOpen(r.id)}
                  className="group block w-full overflow-hidden rounded-2xl border bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-display text-base font-semibold">
                        {fmtWeekRange(r.week_start, r.week_end)}
                      </div>
                      <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-accent">
                        Personal · 40% rate
                      </div>
                      <div className="mt-1.5">
                        <StatusPill status={r.status as any} />
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
                  </div>
                  <div className="num mt-3 grid grid-cols-3 gap-3">
                    <Stat label="My Jobs Sales" value={fmtMoney(Number(r.total_sales))} />
                    <Stat label="Tips" value={fmtMoney(Number(r.total_tips))} />
                    <Stat label="My Weekly Balance" value={fmtMoney(Number(r.net_balance))} cls={balanceCls} />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function MyBalancePanel({
  loading,
  summary,
  reports,
  onOpen,
}: {
  loading: boolean;
  summary: { count: number; totalSales: number; totalTips: number; owed: number; owe: number };
  reports: Array<any>;
  onOpen: (id: string) => void;
}) {
  if (loading) return <Loader />;
  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCard icon={ClipboardList} label="My reports" value={summary.count} tone="info" />
        <SummaryCard icon={Wallet} label="Total my sales" value={fmtMoney(summary.totalSales)} tone="neutral" />
        <SummaryCard icon={ArrowDownLeft} label="Company owes me" value={fmtMoney(summary.owed)} tone="success" />
        <SummaryCard icon={ArrowUpRight} label="I owe company" value={fmtMoney(summary.owe)} tone="danger" />
      </section>

      {reports.length === 0 ? (
        <EmptyCard text="No personal reports yet. Use 'My Reports' to start one." />
      ) : (
        <ul className="space-y-3">
          {reports.map((r) => {
            const cls = moneyClass(Number(r.net_balance));
            return (
              <li key={r.id}>
                <button
                  onClick={() => onOpen(r.id)}
                  className="group block w-full overflow-hidden rounded-2xl border bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-display text-base font-semibold">
                        {fmtWeekRange(r.week_start, r.week_end)}
                      </div>
                      <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-accent">
                        Personal · 40% rate
                      </div>
                      <div className="mt-1.5">
                        <StatusPill status={r.status as any} />
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
                  </div>
                  <div className="num mt-3 grid grid-cols-3 gap-3">
                    <Stat label="My Jobs Sales" value={fmtMoney(Number(r.total_sales))} />
                    <Stat label="Tips" value={fmtMoney(Number(r.total_tips))} />
                    <Stat label="My Weekly Balance" value={fmtMoney(Number(r.net_balance))} cls={cls} />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
