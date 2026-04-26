import { ArrowDownLeft, ArrowUpRight, CheckCircle2 } from "lucide-react";
import { fmtMoney, resolveBalance } from "@/lib/format";
import { cn } from "@/lib/utils";

export type BalanceDirectionRaw =
  | "company_owes_technician"
  | "technician_owes_company"
  | "settled"
  | string
  | null
  | undefined;

/**
 * Bidirectional balance display.
 *
 * Direction is resolved through `resolveBalance()`. When called with a
 * report-level number, the DB `balance_direction` MUST be passed as the
 * authoritative direction (report-level `net_balance` has an inverted sign
 * convention vs. per-job `balance`).
 */
export function BalanceCallout({
  netBalance,
  direction,
  audience = "technician",
  className,
}: {
  netBalance: number;
  direction?: BalanceDirectionRaw;
  audience?: "technician" | "manager";
  className?: string;
}) {
  const resolved = resolveBalance(netBalance, direction ?? undefined);
  const isSettled = resolved.direction === "SETTLED";

  const label = isSettled
    ? "Settled — no balance owed"
    : audience === "technician"
    ? resolved.labelTechnician
    : resolved.labelManager;

  const Icon = isSettled
    ? CheckCircle2
    : resolved.direction === "COMPANY_OWES_TECH"
    ? ArrowDownLeft
    : ArrowUpRight;

  const toneCls =
    resolved.tone === "pos"
      ? "bg-[hsl(var(--status-approved-bg))] text-[hsl(var(--status-approved-fg))] border-[hsl(var(--status-approved-fg))]/20"
      : resolved.tone === "neg"
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
          <div className="num font-display text-2xl font-bold tabular-nums leading-tight">
            {fmtMoney(resolved.amount)}
          </div>
        )}
      </div>
    </div>
  );
}
