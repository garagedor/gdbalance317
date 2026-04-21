import { ArrowDownLeft, ArrowUpRight, CheckCircle2 } from "lucide-react";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Bidirectional balance display.
 * netBalance > 0  → company owes technician
 * netBalance < 0  → technician owes company
 * netBalance == 0 → settled
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
      ? "bg-money-pos/10 text-money-pos border-money-pos/30"
      : tone === "neg"
      ? "bg-money-neg/10 text-money-neg border-money-neg/30"
      : "bg-muted text-muted-foreground border-border";

  return (
    <div className={cn("flex items-center gap-3 rounded-xl border px-4 py-3", toneCls, className)}>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-current/10">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-wider opacity-80">{label}</div>
        {!isSettled && (
          <div className="num font-display text-2xl font-bold tabular-nums">{fmtMoney(abs)}</div>
        )}
      </div>
    </div>
  );
}
