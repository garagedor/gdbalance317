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
}

export function JobsTable({ rows, loading, showTechnician, onEdit, onDelete, onRestore, emptyHint }: Props) {
  const colSpan = 14 + (showTechnician ? 1 : 0) + (onEdit || onDelete ? 1 : 0);
  return (
    <div className="max-h-[70vh] overflow-auto rounded-2xl border bg-card shadow-sm">
      <Table className="min-w-[1200px] w-full text-sm">
        <TableHeader className="sticky top-0 z-10 bg-muted/95 backdrop-blur supports-[backdrop-filter]:bg-muted/80 shadow-[0_1px_0_0_hsl(var(--border))]">
          <TableRow className="hover:bg-transparent">
            <TableHead className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider">Date</TableHead>
            <TableHead className="whitespace-nowrap">Address</TableHead>
            {showTechnician && <TableHead className="whitespace-nowrap">Technician</TableHead>}
            <TableHead className="whitespace-nowrap">Pay Method</TableHead>
            <TableHead className="whitespace-nowrap">Approvals</TableHead>
            <TableHead className="whitespace-nowrap text-right">Job Total</TableHead>
            <TableHead className="whitespace-nowrap text-right">Tech Parts</TableHead>
            <TableHead className="whitespace-nowrap text-right">Company Parts</TableHead>
            <TableHead className="whitespace-nowrap text-right">Payment Fee</TableHead>
            <TableHead className="whitespace-nowrap text-right">Total Profit</TableHead>
            <TableHead className="whitespace-nowrap text-right">Tech Payout</TableHead>
            <TableHead className="whitespace-nowrap text-right">Cash</TableHead>
            <TableHead className="whitespace-nowrap text-right">Balance</TableHead>
            <TableHead className="whitespace-nowrap text-right">Tips</TableHead>
            <TableHead className="whitespace-nowrap text-right">Balance + Tips</TableHead>
            {(onEdit || onDelete) && <TableHead className="w-[1%]" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={colSpan} className="py-10 text-center text-muted-foreground">
                Loading…
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={colSpan} className="py-10 text-center text-muted-foreground">
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
                  <TableCell className="whitespace-nowrap font-medium tabular-nums">
                    {format(new Date(j.job_date + "T00:00:00"), "MMM d")}
                  </TableCell>
                  <TableCell className="max-w-[260px] truncate">
                    <div className="truncate" title={j.address ?? undefined}>{j.address || "—"}</div>
                    {j.customer_name && (
                      <div className="truncate text-xs text-muted-foreground" title={j.customer_name ?? undefined}>{j.customer_name}</div>
                    )}
                  </TableCell>
                  {showTechnician && (
                    <TableCell className="whitespace-nowrap">{j.technician_name ?? "—"}</TableCell>
                  )}
                  <TableCell>
                    <Badge variant="secondary" className="font-normal">{pay}</Badge>
                  </TableCell>
                  <TableCell className="space-x-1">
                    {j.report_status && (
                      <Badge variant="outline" className="text-[10px] uppercase">{j.report_status}</Badge>
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
                  <TableCell className="text-right tabular-nums">{fmtMoney(j.job_total)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(j.tech_parts)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(j.company_parts)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{fmtMoney(j.payment_fee)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(j.total_profit)}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{fmtMoney(j.tech_payout_new)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(j.cash)}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", balanceClass(j.balance))}>
                    {fmtMoney(j.balance)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(j.tips_total)}</TableCell>
                  <TableCell className={cn("text-right font-semibold tabular-nums", balanceClass(j.balance_plus_tips))}>
                    {fmtMoney(j.balance_plus_tips)}
                  </TableCell>
                  {(onEdit || onDelete) && (
                    <TableCell className="whitespace-nowrap">
                      {j.is_deleted ? (
                        onRestore && (
                          <Button size="icon" variant="ghost" onClick={() => onRestore(j.id)} aria-label="Restore">
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        )
                      ) : (
                        <div className="flex items-center gap-0.5">
                          {onEdit && (
                            <Button size="icon" variant="ghost" onClick={() => onEdit(j.id)} aria-label="Edit">
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {onDelete && (
                            <Button size="icon" variant="ghost" onClick={() => onDelete(j.id)} aria-label="Delete">
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
