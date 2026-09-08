import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { useMyReports } from "@/hooks/useReports";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/StatusPill";
import { fmtWeekRange } from "@/lib/week";
import { fmtMoney, moneyClass } from "@/lib/format";
import { computeTechnicianEarnings } from "@/lib/finance/calc";
import { Loader2, ChevronRight, Wrench, LogOut, TrendingUp, AlertTriangle, FileEdit } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { cn } from "@/lib/utils";
import { TechOnboarding, useFirstTimeOnboarding } from "@/components/tech/TechOnboarding";
import { TechHelpChat, HelpButton } from "@/components/tech/TechHelpChat";
import { NotificationBell } from "@/components/NotificationBell";
import { RefreshButton } from "@/components/RefreshButton";

export default function TechHome() {
  const { profile, signOut } = useAuth();
  const { data: reports, isLoading } = useMyReports();
  const nav = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const { open: onbOpen, setOpen: setOnbOpen } = useFirstTimeOnboarding();
  const [helpOpen, setHelpOpen] = useState(false);

  const totalEarnings = (reports ?? [])
    .filter((r) => r.status === "Approved")
    .reduce((sum, r) => sum + computeTechnicianEarnings(r), 0);
  const pendingCount = (reports ?? []).filter((r) =>
    ["Submitted", "Under Review", "Returned"].includes(r.status),
  ).length;

  return (
    <div className="min-h-dvh overflow-x-hidden pb-12">
      <header className="sticky top-0 z-20 border-b bg-card/80 backdrop-blur-md safe-top">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-2 px-3 py-3 sm:px-5 sm:py-4">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl gradient-accent shadow-glow sm:h-11 sm:w-11">
              <Wrench className="h-4 w-4 text-accent-foreground sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:text-[11px]">
                Hi {profile?.full_name?.split(" ")[0]}
                {typeof profile?.commission_rate === "number" && (
                  <span className="ml-1.5 rounded-full bg-secondary px-1.5 py-0.5 text-[9px] font-semibold text-secondary-foreground sm:text-[10px]">
                    {Math.round((profile.commission_rate || 0) * 100)}%
                  </span>
                )}
              </p>
              <h1 className="truncate font-display text-base font-bold leading-tight sm:text-lg">
                Your weekly reports
              </h1>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
            <RefreshButton />
            <NotificationBell />
            <HelpButton onClick={() => setHelpOpen(true)} />
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={async () => { setSigningOut(true); await signOut(); }}
              disabled={signingOut}
              aria-label="Sign out"
            >
              {signingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </header>

      <TechOnboarding open={onbOpen} onClose={() => setOnbOpen(false)} />
      <TechHelpChat open={helpOpen} onOpenChange={setHelpOpen} />

      <main className="mx-auto w-full max-w-2xl space-y-5 px-5 py-5">
        {/* Current week snapshot */}
        {currentReport && (
          <button
            onClick={() => nav(`/tech/report/${currentReport.id}`)}
            className="relative block w-full overflow-hidden rounded-2xl gradient-primary p-5 text-left text-primary-foreground shadow-lg transition-transform hover:-translate-y-0.5 animate-fade-in-up"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wider opacity-80">
                  This week
                </div>
                <div className="truncate font-display text-lg font-bold">
                  {fmtWeekRange(currentReport.week_start, currentReport.week_end)}
                </div>
              </div>
              <StatusPill status={currentReport.status} />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <MiniStat label="Sales" value={fmtMoney(Number(currentReport.total_sales))} />
              <MiniStat label="Tips" value={fmtMoney(Number(currentReport.total_tips))} />
              <MiniStat label="Balance" value={fmtMoney(Number(currentReport.net_balance))} />
            </div>
            <div className="absolute -right-8 -bottom-8 h-24 w-24 rounded-full bg-primary-foreground/5" />
          </button>
        )}

        {/* Action center */}
        {(returnedReports.length > 0 || draftReports.length > 0) && (
          <section className="space-y-2 animate-fade-in-up">
            {returnedReports.map((r) => (
              <button
                key={r.id}
                onClick={() => nav(`/tech/report/${r.id}`)}
                className="flex w-full items-center gap-3 rounded-2xl border border-[hsl(var(--status-returned-fg))]/30 bg-[hsl(var(--status-returned-bg))]/50 px-4 py-3 text-left"
              >
                <AlertTriangle className="h-4 w-4 shrink-0 text-[hsl(var(--status-returned-fg))]" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">Report returned — needs your fix</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {fmtWeekRange(r.week_start, r.week_end)}
                    {r.manager_note ? ` · “${r.manager_note}”` : ""}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
            {draftReports.map((r) => (
              <button
                key={r.id}
                onClick={() => nav(`/tech/report/${r.id}`)}
                className="flex w-full items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-left"
              >
                <FileEdit className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">Draft not sent yet</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {fmtWeekRange(r.week_start, r.week_end)} — add your jobs and send for verification
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </section>
        )}

        {/* KPI row */}
        <section className="grid grid-cols-3 gap-3 animate-fade-in-up">
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" /> Earned
            </div>
            <div className="num mt-2 font-display text-xl font-bold tabular-nums">
              {fmtMoney(totalEarnings)}
            </div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">All-time approved</div>
          </div>
          <div
            className={cn(
              "rounded-2xl border p-4 shadow-sm",
              pendingCount > 0
                ? "bg-[hsl(var(--status-submitted-bg))] border-[hsl(var(--status-submitted-fg))]/20"
                : "bg-card",
            )}
          >
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Pending
            </div>
            <div
              className={cn(
                "num mt-2 font-display text-xl font-bold tabular-nums",
                pendingCount > 0 && "text-[hsl(var(--status-submitted-fg))]",
              )}
            >
              {pendingCount}
            </div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">With management</div>
          </div>
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Approved
            </div>
            <div className="num mt-2 font-display text-xl font-bold tabular-nums">
              {approvedCount}
            </div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">Weeks verified</div>
          </div>
        </section>

        {/* Recent weeks trend */}
        {trend.length > 1 && (
          <section className="rounded-2xl border bg-card p-4 shadow-sm animate-fade-in-up">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Last weeks · sales
            </div>
            <div className="h-[140px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <defs>
                    <linearGradient id="techSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={10} />
                  <YAxis tickLine={false} axisLine={false} fontSize={10} width={52} />
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
                    fill="url(#techSales)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        <h2 className="pt-1 font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          All weeks
        </h2>


        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-32 w-full rounded-2xl shimmer" />
            ))}
          </div>
        ) : !reports || reports.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
              <p className="font-display text-lg font-semibold">No weekly reports yet</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Reports open every week at 8:00 PM Indiana time, covering Monday → Sunday.
                If you don't see one, ask management to assign you to an area.
              </p>
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {reports.map((r, idx) => {
              const balance = Number(r.net_balance);
              const balanceTone =
                balance > 0.005 ? "pos" : balance < -0.005 ? "neg" : "neutral";
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
                  style={{ animationDelay: `${idx * 40}ms`, animationFillMode: "backwards" }}
                >
                  <button
                    onClick={() => nav(`/tech/report/${r.id}`)}
                    className="group relative block w-full overflow-hidden rounded-2xl border bg-card p-4 pl-5 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className={cn("absolute inset-y-3 left-2 w-1 rounded-full", accentBar)} />
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-display text-base font-semibold">
                          {fmtWeekRange(r.week_start, r.week_end)}
                        </div>
                        <div className="mt-1.5">
                          <StatusPill status={r.status} />
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform duration-200 group-hover:translate-x-1" />
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-3 num">
                      <Stat label="Sales" value={fmtMoney(Number(r.total_sales))} />
                      <Stat label="Tips" value={fmtMoney(Number(r.total_tips))} />
                      <Stat
                        label="Net balance"
                        value={fmtMoney(Number(r.net_balance))}
                        cls={moneyClass(Number(r.net_balance))}
                        tone={balanceTone}
                      />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}

function Stat({
  label,
  value,
  cls,
  tone,
}: {
  label: string;
  value: string;
  cls?: string;
  tone?: "pos" | "neg" | "neutral";
}) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-0.5 text-sm font-bold tabular-nums", cls)}>{value}</div>
    </div>
  );
}
