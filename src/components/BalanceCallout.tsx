import { ArrowDownLeft, ArrowUpRight, CheckCircle2 } from "lucide-react";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Bidirectional balance display.
 * netBalance > 0  → company owes technician (green)
 * netBalance < 0  → technician owes company (red)
 * netBalance == 0 → settled (neutral)
 */
export function BalanceCallout({
  netBalance,
  audience = "technician",
  className,
}: {
  netBalance: number;
  audience?: "technician" | "manager";
  className?: string;
}) {
  const abs = Math.abs(netBalance);
  const isSettled = abs < 0.005;
  const companyOwes = netBalance > 0.005;

  let label: string;
  let tone: "pos" | "neg" | "neutral";
  let Icon = CheckCircle2;

  if (isSettled) {
    label = "Settled — no balance owed";
    tone = "neutral";
  } else if (companyOwes) {
    label = audience === "technician" ? "Company owes you" : "Company owes technician";
    tone = "pos";
    Icon = ArrowDownLeft;
  } else {
    label = audience === "technician" ? "You owe the company" : "Technician owes company";
    tone = "neg";
    Icon = ArrowUpRight;
  }

  const toneCls =
    tone === "pos"
      ? "bg-[hsl(var(--status-approved-bg))] text-[hsl(var(--status-approved-fg))] border-[hsl(var(--status-approved-fg))]/20"
      : tone === "neg"
      ? "bg-[hsl(var(--status-returned-bg))] text-[hsl(var(--status-returned-fg))] border-[hsl(var(--status-returned-fg))]/20"
      : "bg-muted text-muted-foreground border-border";

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl border px-5 py-4 shadow-sm animate-fade-in",
        toneCls,
        className,
      )}
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-current/10 ring-1 ring-current/15">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-80">{label}</div>
        {!isSettled && (
          <div className="num font-display text-2xl font-bold tabular-nums leading-tight">{fmtMoney(abs)}</div>
        )}
      </div>
    </div>
  );
}
