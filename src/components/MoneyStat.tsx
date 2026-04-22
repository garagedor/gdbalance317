import { fmtMoney, moneyClass } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: number | string | null | undefined;
  hint?: string;
  emphasis?: "default" | "primary" | "money" | "info" | "success" | "warning" | "danger";
  className?: string;
  icon?: React.ComponentType<{ className?: string }>;
}

const emphasisStyles: Record<NonNullable<Props["emphasis"]>, { wrap: string; label: string; value?: string }> = {
  default: { wrap: "bg-card border-border", label: "text-muted-foreground" },
  primary: { wrap: "gradient-primary border-transparent text-primary-foreground", label: "text-primary-foreground/70" },
  money:   { wrap: "bg-card border-border", label: "text-muted-foreground" },
  info:    { wrap: "bg-[hsl(var(--status-review-bg))] border-[hsl(var(--status-review-fg))]/20", label: "text-[hsl(var(--status-review-fg))]/80", value: "text-[hsl(var(--status-review-fg))]" },
  success: { wrap: "bg-[hsl(var(--status-approved-bg))] border-[hsl(var(--status-approved-fg))]/20", label: "text-[hsl(var(--status-approved-fg))]/80", value: "text-[hsl(var(--status-approved-fg))]" },
  warning: { wrap: "bg-[hsl(var(--status-submitted-bg))] border-[hsl(var(--status-submitted-fg))]/20", label: "text-[hsl(var(--status-submitted-fg))]/80", value: "text-[hsl(var(--status-submitted-fg))]" },
  danger:  { wrap: "bg-[hsl(var(--status-returned-bg))] border-[hsl(var(--status-returned-fg))]/20", label: "text-[hsl(var(--status-returned-fg))]/80", value: "text-[hsl(var(--status-returned-fg))]" },
};

export function MoneyStat({ label, value, hint, emphasis = "default", className, icon: Icon }: Props) {
  const v = typeof value === "string" ? parseFloat(value) : value ?? 0;
  const styles = emphasisStyles[emphasis];
  return (
    <div
      className={cn(
        "group rounded-xl border p-3.5 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5",
        styles.wrap,
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className={cn("text-[10px] font-semibold uppercase tracking-[0.12em]", styles.label)}>
          {label}
        </div>
        {Icon && (
          <Icon className={cn("h-3.5 w-3.5 opacity-60", styles.label)} />
        )}
      </div>
      <div
        className={cn(
          "num mt-1.5 font-display text-xl font-bold tabular-nums leading-tight",
          emphasis === "money" && moneyClass(v),
          styles.value,
        )}
      >
        {fmtMoney(v)}
      </div>
      {hint && (
        <div className={cn("mt-0.5 text-[11px] leading-snug", styles.label)}>
          {hint}
        </div>
      )}
    </div>
  );
}
