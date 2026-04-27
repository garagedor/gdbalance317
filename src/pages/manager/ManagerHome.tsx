import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { useMyTechnicians, useManagedReports } from "@/hooks/useManager";
import { useMyReports } from "@/hooks/useReports";
import { useMyAreas } from "@/hooks/useUserAreas";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { todayInTimezone } from "@/lib/week";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  LogOut,
  MapPin,
  Plus,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type TabKey = "techs" | "pending" | "approved" | "payments" | "mine";

export default function ManagerHome() {
  const { profile, signOut } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabKey>("techs");
  const [creating, setCreating] = useState(false);
  const [pickAreaOpen, setPickAreaOpen] = useState(false);
  const [pickedAreaId, setPickedAreaId] = useState<string | null>(null);

  const { data: techs, isLoading: techsLoading } = useMyTechnicians();
  const { data: reports, isLoading: reportsLoading } = useManagedReports();
  const { data: myReports, isLoading: myReportsLoading } = useMyReports();
  const { data: myAreaRows } = useMyAreas();

  // Areas the AM is assigned to (with names). Falls back to primary `area_id`.
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

      // Avoid duplicates: same week_start + same area for this AM
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

  const stats = useMemo(() => {
    const list = reports ?? [];
    const pending = list.filter((r) => ["Submitted", "Under Review", "Returned"].includes(r.status));
    const approved = list.filter((r) => r.status === "Approved");
    // Direction is resolved with the DB `balance_direction` as the
    // authoritative hint at report level (report-level net_balance has an
    // inverted sign convention vs. per-job balance).
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

  const visibleReports = useMemo(() => {
    const list = reports ?? [];
    if (tab === "pending") return list.filter((r) => ["Submitted", "Under Review", "Returned"].includes(r.status));
    if (tab === "approved") return list.filter((r) => r.status === "Approved");
    if (tab === "payments")
      return list.filter((r) => r.status === "Approved" && r.balance_payment_status !== "settled");
    return [];
  }, [reports, tab]);

  return (
    <div className="min-h-dvh pb-12">
      <header className="sticky top-0 z-20 border-b bg-card/80 backdrop-blur-md safe-top">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl gradient-accent shadow-glow">
              <ShieldCheck className="h-5 w-5 text-accent-foreground" />
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Area Manager
              </p>
              <h1 className="font-display text-lg font-bold leading-tight">{profile?.full_name}</h1>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl space-y-6 px-5 py-6">
        {/* Summary cards */}
        <section className="grid grid-cols-2 gap-3 animate-fade-in-up md:grid-cols-3 lg:grid-cols-6">
          <SummaryCard icon={Users} label="Assigned techs" value={stats.assigned} loading={techsLoading} tone="info" />
          <SummaryCard icon={HourglassIcon} label="Pending reports" value={stats.pending} loading={reportsLoading} tone="warning" />
          <SummaryCard icon={ClipboardList} label="Approved" value={stats.approved} loading={reportsLoading} tone="success" />
          <SummaryCard
            icon={ArrowDownLeft}
            label="Company owes techs"
            value={fmtMoney(stats.companyOwes)}
            loading={reportsLoading}
            tone="danger"
          />
          <SummaryCard
            icon={ArrowUpRight}
            label="Techs owe company"
            value={fmtMoney(stats.techsOwe)}
            loading={reportsLoading}
            tone="success"
          />
          <SummaryCard
            icon={Wallet}
            label="Open balances"
            value={stats.openCount}
            loading={reportsLoading}
            tone={stats.openCount > 0 ? "warning" : "neutral"}
          />
        </section>

        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList className="grid w-full max-w-3xl grid-cols-5">
            <TabsTrigger value="techs">My Technicians</TabsTrigger>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
            <TabsTrigger value="payments">Payment Tracking</TabsTrigger>
            <TabsTrigger value="mine">My Reports</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* MY REPORTS — area manager submitting their own jobs */}
        {tab === "mine" && (
          <MyReportsPanel
            loading={myReportsLoading}
            reports={myReports ?? []}
            creating={creating}
            onOpen={(id) => nav(`/tech/report/${id}`)}
            onCreate={() => {
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
            }}
          />
        )}

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

        {/* My Technicians */}
        {tab === "techs" && (
          techsLoading ? (
            <Loader />
          ) : !techs || techs.length === 0 ? (
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

        {/* Pending / Approved / Payments lists */}
        {tab !== "techs" && tab !== "mine" && (
          reportsLoading ? (
            <Loader />
          ) : visibleReports.length === 0 ? (
            <EmptyCard text="Nothing here yet." />
          ) : (
            <ul className="space-y-3">
              {visibleReports.map((r, idx) => {
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
                      onClick={() => nav(`/manager/report/${r.id}`)}
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
          )
        )}
      </main>
    </div>
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
    <div
      className={cn(
        "group rounded-2xl border p-3.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
        s.wrap,
      )}
    >
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

/**
 * Area Manager personal weekly reports panel. Same data model as a technician
 * report — the AM owns the row by being its `technician_id`. Editing flows
 * through the existing /tech/report/:id screen.
 */
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
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold">My weekly reports</h2>
          <p className="text-xs text-muted-foreground">
            Submit reports for jobs you personally performed. Same flow as a technician.
          </p>
        </div>
        <Button onClick={onCreate} disabled={creating} className="gap-2">
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          New report
        </Button>
      </div>

      {loading ? (
        <Loader />
      ) : reports.length === 0 ? (
        <EmptyCard text="No personal reports yet. Click 'New report' to start one for this week." />
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
                      <div className="mt-1.5">
                        <StatusPill status={r.status as any} />
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
                  </div>
                  <div className="num mt-3 grid grid-cols-3 gap-3">
                    <Stat label="Sales" value={fmtMoney(Number(r.total_sales))} />
                    <Stat label="Tips" value={fmtMoney(Number(r.total_tips))} />
                    <Stat label="Net balance" value={fmtMoney(Number(r.net_balance))} cls={balanceCls} />
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

