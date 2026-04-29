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
import { Loader2, ChevronRight, Wrench, LogOut, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { TechOnboarding, useFirstTimeOnboarding } from "@/components/tech/TechOnboarding";
import { TechHelpChat, HelpButton } from "@/components/tech/TechHelpChat";
import { NotificationBell } from "@/components/NotificationBell";

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
    <div className="min-h-dvh pb-12">
      <header className="sticky top-0 z-20 border-b bg-card/80 backdrop-blur-md safe-top">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl gradient-accent shadow-glow">
              <Wrench className="h-5 w-5 text-accent-foreground" />
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Hi {profile?.full_name?.split(" ")[0]}
                {typeof profile?.commission_rate === "number" && (
                  <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-secondary-foreground">
                    Commission {Math.round((profile.commission_rate || 0) * 100)}%
                  </span>
                )}
              </p>
              <h1 className="font-display text-lg font-bold leading-tight">Your weekly reports</h1>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <NotificationBell />
            <HelpButton onClick={() => setHelpOpen(true)} />
            <Button
              variant="ghost"
              size="icon"
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
        {/* KPI hero — premium gradient */}
        <section className="grid grid-cols-2 gap-3 animate-fade-in-up">
          <div className="relative overflow-hidden rounded-2xl gradient-primary p-4 text-primary-foreground shadow-lg">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-3.5 w-3.5 opacity-80" />
              <span className="text-[10px] font-semibold uppercase tracking-wider opacity-80">
                Approved earnings
              </span>
            </div>
            <div className="num mt-2 font-display text-2xl font-bold tabular-nums">
              {fmtMoney(totalEarnings)}
            </div>
            <div className="mt-0.5 text-[11px] opacity-70">All-time net profit</div>
            <div className="absolute -right-6 -bottom-6 h-20 w-20 rounded-full bg-primary-foreground/5" />
          </div>
          <div
            className={cn(
              "relative overflow-hidden rounded-2xl border p-4 shadow-sm transition-all",
              pendingCount > 0
                ? "bg-[hsl(var(--status-submitted-bg))] border-[hsl(var(--status-submitted-fg))]/20"
                : "bg-card",
            )}
          >
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Pending reports
            </div>
            <div
              className={cn(
                "num mt-2 font-display text-2xl font-bold tabular-nums",
                pendingCount > 0 && "text-[hsl(var(--status-submitted-fg))]",
              )}
            >
              {pendingCount}
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">Awaiting management</div>
          </div>
        </section>

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
