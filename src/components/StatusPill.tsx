import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ReportStatus } from "@/lib/finance";

const map: Record<ReportStatus, { label: string; cls: string }> = {
  Draft:          { label: "Draft",        cls: "bg-[hsl(var(--status-draft-bg))] text-[hsl(var(--status-draft-fg))]" },
  Submitted:      { label: "Submitted",    cls: "bg-[hsl(var(--status-submitted-bg))] text-[hsl(var(--status-submitted-fg))]" },
  "Under Review": { label: "Under Review", cls: "bg-[hsl(var(--status-review-bg))] text-[hsl(var(--status-review-fg))]" },
  Returned:       { label: "Returned",     cls: "bg-[hsl(var(--status-returned-bg))] text-[hsl(var(--status-returned-fg))]" },
  Approved:       { label: "Approved",     cls: "bg-[hsl(var(--status-approved-bg))] text-[hsl(var(--status-approved-fg))]" },
};

export function StatusPill({ status, className }: { status: ReportStatus; className?: string }) {
  const m = map[status];
  return (
    <Badge variant="outline" className={cn("border-transparent font-medium", m.cls, className)}>
      <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {m.label}
    </Badge>
  );
}
