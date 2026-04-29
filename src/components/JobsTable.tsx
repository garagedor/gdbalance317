/**
 * Shared jobs table — matches the old system column order.
 * Used by Office Jobs (Phase 4). Keeps technician/manager/admin report
 * tables untouched (they still read the legacy mirrored columns).
 */
import { format } from "date-fns";
import { Pencil, Trash2, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { fmtMoney, balanceClass } from "@/lib/format";
import { derivePayMethod } from "@/lib/finance";
import { cn } from "@/lib/utils";

export interface JobsTableRow {
  id: string;
  job_date: string;
  address?: string | null;
  customer_name?: string | null;
  technician_name?: string | null;
  // Phase-4 inputs (used to derive Pay Method)
  tech_paid_cash: number;
  paid_card: number;
  paid_company_cash: number;
  paid_company_check: number;
  paid_finance: number;
  // Phase-4 outputs
  job_total: number;
  tech_parts: number;
  company_parts: number;
  payment_fee: number;
  total_profit: number;
  tech_payout_new: number;
  cash: number;
  balance: number;
  tips_total: number;
  balance_plus_tips: number;
  // Approvals (one or both)
  report_status?: string | null;
  reconciliation_status?: string | null;
  is_deleted?: boolean;
}

interface Props {
  rows: JobsTableRow[];
  loading?: boolean;
  showTechnician?: boolean;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onRestore?: (id: string) => void;
  emptyHint?: React.ReactNode;
  compact?: boolean;
  className?: string;
}

export function JobsTable({ rows, loading, showTechnician, onEdit, onDelete, onRestore, emptyHint, compact, className }: Props) {
  const colSpan = 14 + (showTechnician ? 1 : 0) + (onEdit || onDelete ? 1 : 0);
  const headClass = compact ? "h-8 px-2 text-[10px] leading-tight" : undefined;
  const cellClass = compact ? "px-2 py-2 text-[11px] leading-tight" : undefined;
  return (
    <div className={cn("overflow-x-auto rounded-2xl border bg-card shadow-sm lg:max-h-[70vh] lg:overflow-auto", compact && "rounded-lg", className)}>
      <Table className={cn("min-w-[1200px] w-full text-sm", compact && "w-full min-w-[980px] table-fixed text-[11px] xl:min-w-0")}>
        {compact && !showTechnician && (
          <colgroup>
            <col className="w-[5%]" />
            <col className="w-[18%]" />
            <col className="w-[6%]" />
            <col className="w-[7%]" />
            <col className="w-[6.4%]" />
            <col className="w-[6.4%]" />
            <col className="w-[6.4%]" />
            <col className="w-[6.4%]" />
            <col className="w-[6.4%]" />
            <col className="w-[6.4%]" />
            <col className="w-[6.4%]" />
            <col className="w-[6.4%]" />
            <col className="w-[5%]" />
            <col className="w-[6.4%]" />
            {(onEdit || onDelete) && <col className="w-[4%]" />}
          </colgroup>
        )}
        <TableHeader className="sticky top-0 z-10 bg-muted/95 backdrop-blur supports-[backdrop-filter]:bg-muted/80 shadow-[0_1px_0_0_hsl(var(--border))]">
          <TableRow className="hover:bg-transparent">
            <TableHead className={cn("whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider", headClass)}>Date</TableHead>
            <TableHead className={cn("whitespace-nowrap", headClass)}>Address</TableHead>
            {showTechnician && <TableHead className={cn("whitespace-nowrap", headClass)}>Technician</TableHead>}
            <TableHead className={cn("whitespace-nowrap", headClass)}>{compact ? "Pay" : "Pay Method"}</TableHead>
            <TableHead className={cn("whitespace-nowrap", headClass)}>{compact ? "Status" : "Approvals"}</TableHead>
            <TableHead className={cn("whitespace-nowrap text-right", headClass)}>{compact ? "Job" : "Job Total"}</TableHead>
            <TableHead className={cn("whitespace-nowrap text-right", headClass)}>Tech Parts</TableHead>
            <TableHead className={cn("whitespace-nowrap text-right", headClass)}>{compact ? "Co Parts" : "Company Parts"}</TableHead>
            <TableHead className={cn("whitespace-nowrap text-right", headClass)}>{compact ? "Fee" : "Payment Fee"}</TableHead>
            <TableHead className={cn("whitespace-nowrap text-right", headClass)}>{compact ? "Profit" : "Total Profit"}</TableHead>
            <TableHead className={cn("whitespace-nowrap text-right", headClass)}>{compact ? "Payout" : "Tech Payout"}</TableHead>
            <TableHead className={cn("whitespace-nowrap text-right", headClass)}>Cash</TableHead>
            <TableHead className={cn("whitespace-nowrap text-right", headClass)}>Balance</TableHead>
            <TableHead className={cn("whitespace-nowrap text-right", headClass)}>Tips</TableHead>
            <TableHead className={cn("whitespace-nowrap text-right", headClass)}>{compact ? "Bal + Tips" : "Balance + Tips"}</TableHead>
            {(onEdit || onDelete) && <TableHead className="w-[1%]" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={colSpan} className={cn("py-10 text-center text-muted-foreground", compact && "py-6 text-xs")}>
                Loading…
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={colSpan} className={cn("py-10 text-center text-muted-foreground", compact && "py-6 text-xs")}>
                {emptyHint ?? "No jobs."}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((j) => {
              const pay = derivePayMethod(j);
              const rowAccent =
                j.is_deleted
                  ? "opacity-60"
                  : j.report_status === "Returned"
                  ? "bg-[hsl(var(--status-returned-bg))]/30 hover:bg-[hsl(var(--status-returned-bg))]/50"
                  : j.report_status === "Approved"
                  ? "hover:bg-[hsl(var(--status-approved-bg))]/40"
                  : "hover:bg-muted/40";
              return (
                <TableRow key={j.id} className={cn("transition-colors", rowAccent)}>
                  <TableCell className={cn("whitespace-nowrap font-medium tabular-nums", cellClass)}>
                    {format(new Date(j.job_date + "T00:00:00"), "MMM d")}
                  </TableCell>
                  <TableCell className={cn("max-w-[260px] truncate", compact && "max-w-none", cellClass)}>
                    <div className="truncate" title={j.address ?? undefined}>{j.address || "—"}</div>
                    {j.customer_name && (
                      <div className={cn("truncate text-xs text-muted-foreground", compact && "text-[10px]")} title={j.customer_name ?? undefined}>{j.customer_name}</div>
                    )}
                  </TableCell>
                  {showTechnician && (
                    <TableCell className={cn("whitespace-nowrap", cellClass)}>{j.technician_name ?? "—"}</TableCell>
                  )}
                  <TableCell className={cellClass}>
                    <Badge variant="secondary" className={cn("font-normal", compact && "px-1.5 py-0 text-[10px]")}>{pay}</Badge>
                  </TableCell>
                  <TableCell className={cn("space-x-1", cellClass)}>
                    {j.report_status && (
                      <Badge variant="outline" className={cn("text-[10px] uppercase", compact && "px-1.5 py-0 text-[9px]")}>{j.report_status}</Badge>
                    )}
                    {j.reconciliation_status && (
                      <Badge
                        variant={j.reconciliation_status === "matched" ? "default" : "outline"}
                        className="text-[10px] uppercase"
                      >
                        {j.reconciliation_status}
                      </Badge>
                    )}
                    {j.is_deleted && (
                      <Badge variant="destructive" className="text-[10px] uppercase">Deleted</Badge>
                    )}
                    {!j.report_status && !j.reconciliation_status && !j.is_deleted && (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className={cn("text-right tabular-nums", cellClass)}>{fmtMoney(j.job_total)}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", cellClass)}>{fmtMoney(j.tech_parts)}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", cellClass)}>{fmtMoney(j.company_parts)}</TableCell>
                  <TableCell className={cn("text-right tabular-nums text-muted-foreground", cellClass)}>{fmtMoney(j.payment_fee)}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", cellClass)}>{fmtMoney(j.total_profit)}</TableCell>
                  <TableCell className={cn("text-right tabular-nums font-medium", cellClass)}>{fmtMoney(j.tech_payout_new)}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", cellClass)}>{fmtMoney(j.cash)}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", balanceClass(j.balance), cellClass)}>
                    {fmtMoney(j.balance)}
                  </TableCell>
                  <TableCell className={cn("text-right tabular-nums", cellClass)}>{fmtMoney(j.tips_total)}</TableCell>
                  <TableCell className={cn("text-right font-semibold tabular-nums", balanceClass(j.balance_plus_tips), cellClass)}>
                    {fmtMoney(j.balance_plus_tips)}
                  </TableCell>
                  {(onEdit || onDelete) && (
                    <TableCell className={cn("whitespace-nowrap", cellClass)}>
                      {j.is_deleted ? (
                        onRestore && (
                          <Button size="icon" variant="ghost" className={compact ? "h-7 w-7" : undefined} onClick={() => onRestore(j.id)} aria-label="Restore">
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        )
                      ) : (
                        <div className="flex items-center gap-0.5">
                          {onEdit && (
                            <Button size="icon" variant="ghost" className={compact ? "h-7 w-7" : undefined} onClick={() => onEdit(j.id)} aria-label="Edit">
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {onDelete && (
                            <Button size="icon" variant="ghost" className={compact ? "h-7 w-7" : undefined} onClick={() => onDelete(j.id)} aria-label="Delete">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
