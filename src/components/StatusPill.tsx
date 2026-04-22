import { cn } from "@/lib/utils";
import type { ReportStatus } from "@/lib/finance";
import { CheckCircle2, Clock, FileEdit, RotateCcw, Search } from "lucide-react";

const map: Record<ReportStatus, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  Draft: {
    label: "Draft",
    cls: "bg-[hsl(var(--status-draft-bg))] text-[hsl(var(--status-draft-fg))] ring-[hsl(var(--status-draft-fg))]/15",
    Icon: FileEdit,
  },
  Submitted: {
    label: "Pending",
    cls: "bg-[hsl(var(--status-submitted-bg))] text-[hsl(var(--status-submitted-fg))] ring-[hsl(var(--status-submitted-fg))]/20",
    Icon: Clock,
  },
  "Under Review": {
    label: "Under Review",
    cls: "bg-[hsl(var(--status-review-bg))] text-[hsl(var(--status-review-fg))] ring-[hsl(var(--status-review-fg))]/20",
    Icon: Search,
  },
  Returned: {
    label: "Returned",
    cls: "bg-[hsl(var(--status-returned-bg))] text-[hsl(var(--status-returned-fg))] ring-[hsl(var(--status-returned-fg))]/20",
    Icon: RotateCcw,
  },
  Approved: {
    label: "Approved",
    cls: "bg-[hsl(var(--status-approved-bg))] text-[hsl(var(--status-approved-fg))] ring-[hsl(var(--status-approved-fg))]/20",
    Icon: CheckCircle2,
  },
};

export function StatusPill({
  status,
  className,
  size = "sm",
}: {
  status: ReportStatus;
  className?: string;
  size?: "sm" | "md";
}) {
  const m = map[status];
  const Icon = m.Icon;
  const sizing =
    size === "md"
      ? "px-2.5 py-1 text-xs gap-1.5"
      : "px-2 py-0.5 text-[11px] gap-1";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-semibold uppercase tracking-wider ring-1 ring-inset transition-colors",
        sizing,
        m.cls,
        className,
      )}
    >
      <Icon className={cn(size === "md" ? "h-3.5 w-3.5" : "h-3 w-3")} />
      {m.label}
    </span>
  );
}
