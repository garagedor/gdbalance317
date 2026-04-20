import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { useMyReports } from "@/hooks/useReports";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/StatusPill";
import { fmtWeekRange } from "@/lib/week";
import { fmtMoney, moneyClass } from "@/lib/format";
import { Loader2, ChevronRight, Wrench, LogOut } from "lucide-react";

export default function TechHome() {
  const { profile, signOut } = useAuth();
  const { data: reports, isLoading } = useMyReports();
  const nav = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  return (
    <div className="min-h-dvh bg-background pb-12">
      <header className="border-b bg-card/60 backdrop-blur safe-top">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-accent shadow-glow">
              <Wrench className="h-4 w-4 text-accent-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Hi {profile?.full_name?.split(" ")[0]}</p>
              <h1 className="font-display text-lg font-semibold leading-tight">Your weekly reports</h1>
            </div>
          </div>
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
      </header>

      <main className="mx-auto w-full max-w-2xl px-5 py-5">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : !reports || reports.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
              <p className="font-display text-lg font-semibold">No weekly reports yet</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Reports open every Sunday at 9:00 PM Chicago time for the previous week.
                If you don't see one, ask management to assign you to an area.
              </p>
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {reports.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => nav(`/tech/report/${r.id}`)}
                  className="group block w-full rounded-xl border bg-card p-4 text-left shadow-sm transition hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-display text-base font-semibold">{fmtWeekRange(r.week_start, r.week_end)}</div>
                      <div className="mt-1 flex items-center gap-2">
                        <StatusPill status={r.status} />
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-0.5" />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-3 num">
                    <Stat label="Sales" value={fmtMoney(Number(r.total_sales))} />
                    <Stat label="Tips" value={fmtMoney(Number(r.total_tips))} />
                    <Stat label="Net balance" value={fmtMoney(Number(r.net_balance))} cls={moneyClass(Number(r.net_balance))} />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold tabular-nums ${cls ?? ""}`}>{value}</div>
    </div>
  );
}
