import { fmtMoney, moneyClass } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: number | string | null | undefined;
  hint?: string;
  emphasis?: "default" | "primary" | "money";
  className?: string;
}

export function MoneyStat({ label, value, hint, emphasis = "default", className }: Props) {
  const v = typeof value === "string" ? parseFloat(value) : value ?? 0;
  return (
    <div className={cn(
      "rounded-xl border bg-card p-3 shadow-sm",
      emphasis === "primary" && "gradient-primary border-transparent text-primary-foreground",
      className
    )}>
      <div className={cn(
        "text-[11px] font-medium uppercase tracking-wider",
        emphasis === "primary" ? "text-primary-foreground/70" : "text-muted-foreground"
      )}>
        {label}
      </div>
      <div className={cn(
        "num mt-1 font-display text-xl font-semibold tabular-nums",
        emphasis === "money" && moneyClass(v),
      )}>
        {fmtMoney(v)}
      </div>
      {hint && <div className={cn(
        "mt-0.5 text-[11px]",
        emphasis === "primary" ? "text-primary-foreground/60" : "text-muted-foreground"
      )}>{hint}</div>}
    </div>
  );
}
