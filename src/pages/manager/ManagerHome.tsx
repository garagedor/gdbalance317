import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { useMyTechnicians, useManagedReports } from "@/hooks/useManager";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusPill } from "@/components/StatusPill";
import { fmtWeekRange, fmtDateTime } from "@/lib/week";
import { fmtMoney, moneyClass } from "@/lib/format";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronRight,
  ClipboardList,
  HourglassIcon,
  Loader2,
  LogOut,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

type TabKey = "techs" | "pending" | "approved" | "payments";

export default function ManagerHome() {
  const { profile, signOut } = useAuth();
  const nav = useNavigate();
  const [tab, setTab] = useState<TabKey>("techs");

  const { data: techs, isLoading: techsLoading } = useMyTechnicians();
  const { data: reports, isLoading: reportsLoading } = useManagedReports();

  const stats = useMemo(() => {
    const list = reports ?? [];
    const pending = list.filter((r) => ["Submitted", "Under Review", "Returned"].includes(r.status));
    const approved = list.filter((r) => r.status === "Approved");
    const companyOwes = approved
      .filter((r) => r.balance_direction === "company_owes_technician" && r.balance_payment_status !== "settled")
      .reduce((acc, r) => acc + Math.max(Number(r.net_balance) - Number(r.amount_transferred), 0), 0);
    const techsOwe = approved
      .filter((r) => r.balance_direction === "technician_owes_company" && r.balance_payment_status !== "settled")
      .reduce((acc, r) => acc + Math.max(Math.abs(Number(r.net_balance)) - Number(r.amount_transferred), 0), 0);
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
    <div className="min-h-dvh bg-background pb-12">
      <header className="border-b bg-card/60 backdrop-blur safe-top">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-accent shadow-glow">
              <ShieldCheck className="h-4 w-4 text-accent-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Area Manager</p>
              <h1 className="font-display text-lg font-semibold leading-tight">{profile?.full_name}</h1>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl space-y-5 px-5 py-5">
        {/* Summary cards */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <SummaryCard icon={Users} label="Assigned techs" value={stats.assigned} loading={techsLoading} />
          <SummaryCard icon={HourglassIcon} label="Pending reports" value={stats.pending} loading={reportsLoading} />
          <SummaryCard icon={ClipboardList} label="Approved reports" value={stats.approved} loading={reportsLoading} />
          <SummaryCard
            icon={ArrowDownLeft}
            label="Company owes techs"
            value={fmtMoney(stats.companyOwes)}
            loading={reportsLoading}
            tone="pos"
          />
          <SummaryCard
            icon={ArrowUpRight}
            label="Techs owe company"
            value={fmtMoney(stats.techsOwe)}
            loading={reportsLoading}
            tone="neg"
          />
          <SummaryCard
            icon={Wallet}
            label="Open balances"
            value={stats.openCount}
            loading={reportsLoading}
          />
        </section>

        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList className="grid w-full max-w-2xl grid-cols-4">
            <TabsTrigger value="techs">My Technicians</TabsTrigger>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
            <TabsTrigger value="payments">Payment Tracking</TabsTrigger>
          </TabsList>
        </Tabs>

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
                      <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                          <div className="font-medium">{t.full_name}</div>
                          <div className="truncate text-xs text-muted-foreground">{t.email}</div>
                        </div>
                        <div className="text-right text-xs text-muted-foreground">
                          <div>{techReports.length} reports</div>
                          {open > 0 && <div className="text-money-neg">{open} open</div>}
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
        {tab !== "techs" && (
          reportsLoading ? (
            <Loader />
          ) : visibleReports.length === 0 ? (
            <EmptyCard text="Nothing here yet." />
          ) : (
            <ul className="space-y-2">
              {visibleReports.map((r) => {
                const balanceCls = moneyClass(Number(r.net_balance));
                const remaining = Math.max(Math.abs(Number(r.net_balance)) - Number(r.amount_transferred), 0);
                return (
                  <li key={r.id}>
                    <button
                      onClick={() => nav(`/manager/report/${r.id}`)}
                      className="group block w-full rounded-xl border bg-card p-4 text-left shadow-sm transition hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
                    >
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
                          <ChevronRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5" />
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
                                ? "text-money-pos"
                                : r.balance_payment_status === "partial"
                                ? "text-amber-500"
                                : "text-muted-foreground"
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
  tone,
}: {
  icon: any;
  label: string;
  value: number | string;
  loading?: boolean;
  tone?: "pos" | "neg";
}) {
  const toneCls = tone === "pos" ? "text-money-pos" : tone === "neg" ? "text-money-neg" : "text-foreground";
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex items-center gap-3 p-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className={cn("num font-display text-lg font-semibold tabular-nums", toneCls)}>
            {loading ? "—" : value}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 text-sm font-semibold tabular-nums", cls)}>{value}</div>
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
