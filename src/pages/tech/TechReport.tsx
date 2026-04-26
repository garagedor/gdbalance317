import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  useReport,
  useReportJobs,
  useUpsertJob,
  useDeleteJob,
  useChangeStatus,
  useValidateForSubmission,
  type JobRow,
} from "@/hooks/useReports";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { StatusPill } from "@/components/StatusPill";
import { MoneyStat } from "@/components/MoneyStat";
import { ArrowDownLeft, ArrowUpRight, CheckCircle2 } from "lucide-react";
import { JobSheet } from "@/components/JobSheet";
import { fmtWeekRange, fmtDate } from "@/lib/week";
import { fmtMoney, fmtPct, resolveBalance, fmtMoneyTechFavor, balanceClassTechFavor } from "@/lib/format";
import { derivePayMethod } from "@/lib/finance";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  Loader2,
  Plus,
  Send,
  Bug,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function TechReport() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { profile } = useAuth();
  const { data: report, isLoading } = useReport(id);
  const { data: jobs, isLoading: jobsLoading } = useReportJobs(id);
  const upsert = useUpsertJob(id);
  const del = useDeleteJob(id);
  const changeStatus = useChangeStatus(id);
  const validate = useValidateForSubmission(id);
  const [editing, setEditing] = useState<JobRow | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);

  const editable = report?.status === "Draft" || report?.status === "Returned";
  const isAdmin = profile?.role === "management";
  const defaultDate = useMemo(() => report?.week_start ?? new Date().toISOString().slice(0, 10), [report]);

  if (isLoading || !report) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const onSubmit = async () => {
    setSubmitting(true);
    try {
      const issues = await validate.mutateAsync();
      if (issues.length) {
        toast.error(issues[0]);
        return;
      }
      await changeStatus.mutateAsync({ status: "Submitted" });
      toast.success("Sent for management verification");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not submit");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-dvh pb-44">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b bg-card/80 backdrop-blur-md safe-top">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-5 py-3">
          <Button variant="ghost" size="icon" onClick={() => nav("/tech")} aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-base font-bold">
              {fmtWeekRange(report.week_start, report.week_end)}
            </div>
            <div className="text-xs text-muted-foreground">{jobs?.length ?? 0} jobs</div>
          </div>
          <StatusPill status={report.status} size="md" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl space-y-5 px-5 py-5">
        {/* Returned banner */}
        {report.status === "Returned" && report.manager_note && (
          <Alert variant="destructive" className="border-destructive/30 bg-destructive/5">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Returned for correction</AlertTitle>
            <AlertDescription className="mt-1 whitespace-pre-wrap">{report.manager_note}</AlertDescription>
          </Alert>
        )}

        {/* Premium hero: balance + technician earnings */}
        <HeroSummary
          netBalance={Number(report.net_balance)}
          direction={report.balance_direction}
          yourEarnings={
            Number(report.total_tech_30) +
            Number(report.total_my_parts) +
            Number(report.total_tips)
          }
        />

        {/* Smaller summary metrics — technician perspective only */}
        <Card className="overflow-hidden">
          <CardContent className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-4">
            <MoneyStat label="Total sales" value={Number(report.total_sales)} />
            <MoneyStat label="Total tips" value={Number(report.total_tips)} />
            <MoneyStat label="Card fees" value={Number(report.total_card_fee)} />
            <MoneyStat label={`Your commission (${fmtPct(report.commission_rate)})`} value={Number(report.total_tech_30)} />
          </CardContent>
        </Card>

        {/* Jobs list */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">Jobs</h2>
            {editable && (
              <Button size="sm" variant="outline" onClick={() => { setEditing(null); setSheetOpen(true); }}>
                <Plus className="h-4 w-4" /> Add
              </Button>
            )}
          </div>

          {jobsLoading ? (
            <div className="flex justify-center py-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></div>
          ) : !jobs || jobs.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                <p className="text-sm text-muted-foreground">No jobs yet for this week.</p>
                {editable && (
                  <Button onClick={() => { setEditing(null); setSheetOpen(true); }}>
                    <Plus className="h-4 w-4" /> Add first job
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <ul className="space-y-2">
              {jobs.map((j) => {
                const jobTotal = Number(j.job_total ?? 0);
                const tipsTotal = Number(j.tips_total ?? 0);
                const balPlusTips = Number(j.balance_plus_tips ?? 0);
                const payMethod = derivePayMethod({
                  tech_paid_cash: Number(j.tech_paid_cash ?? 0),
                  paid_card: Number(j.paid_card ?? 0),
                  paid_company_cash: Number(j.paid_company_cash ?? 0),
                  paid_company_check: Number(j.paid_company_check ?? 0),
                  paid_finance: Number(j.paid_finance ?? 0),
                });
                return (
                  <li key={j.id}>
                    <button
                      disabled={!editable}
                      onClick={() => { setEditing(j); setSheetOpen(true); }}
                      className={cn(
                        "group flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left shadow-sm transition",
                        editable && "hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring",
                        !editable && "cursor-default opacity-90"
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{fmtDate(j.job_date)}</span>
                          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-secondary-foreground">
                            {payMethod}
                          </span>
                        </div>
                        <div className="mt-0.5 truncate font-medium">{j.customer_name || "Unnamed customer"}</div>
                        {j.address && <div className="truncate text-xs text-muted-foreground">{j.address}</div>}
                      </div>
                      <div className="text-right num">
                        <div className="font-semibold tabular-nums">{fmtMoney(jobTotal)}</div>
                        <div className="text-xs tabular-nums text-muted-foreground">Tips: {fmtMoney(tipsTotal)}</div>
                        <div className={cn("mt-1 text-xs font-medium tabular-nums", balanceClassTechFavor(balPlusTips))}>
                          Bal+Tips: {fmtMoneyTechFavor(balPlusTips)}
                        </div>
                      </div>
                      {editable && <ChevronRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Detailed totals — technician perspective only */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <MoneyStat label="Your parts" value={Number(report.total_my_parts)} />
          <MoneyStat label="Cash you collected" value={Number(report.tech_cash_collected)} />
          <MoneyStat label="Company collected" value={Number(report.company_cash_collected)} />
        </section>

        {/* Commission rate snapshot */}
        <div className="px-1 text-xs text-muted-foreground">
          Your commission rate this week: <span className="font-medium text-foreground">{fmtPct(report.commission_rate)}</span>
        </div>
      </main>

      {/* Sticky submit bar */}
      {editable && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 backdrop-blur-md shadow-lg safe-bottom">
          <div className="mx-auto flex max-w-2xl items-center gap-3 px-5 py-3">
            <div className="min-w-0 flex-1">
              {(() => {
                // Use DB `balance_direction` as the authoritative direction at
                // report level (report-level net_balance has inverted sign vs.
                // per-job balance). resolveBalance trusts the explicit hint.
                const resolved = resolveBalance(
                  Number(report.net_balance),
                  report.balance_direction,
                );
                const settled = resolved.direction === "SETTLED";
                const miniLabel = settled ? "Balance settled" : resolved.labelTechnician;
                const miniCls = settled
                  ? "text-foreground"
                  : resolved.tone === "pos"
                  ? "text-money-pos"
                  : "text-money-neg";
                return (
                  <>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {miniLabel}
                    </div>
                    <div className={cn("num text-lg font-bold tabular-nums", miniCls)}>
                      {fmtMoney(resolved.amount)}
                    </div>
                  </>
                );
              })()}
            </div>
            <Button
              variant="accent"
              size="lg"
              className="h-12 flex-1 gap-2"
              onClick={onSubmit}
              disabled={submitting || !jobs || jobs.length === 0}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : (<><Send className="h-4 w-4" /> Send for verification</>)}
            </Button>
          </div>
        </div>
      )}

      <JobSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        reportId={id}
        job={editing}
        defaultDate={defaultDate}
        busy={upsert.isPending}
        commissionRate={Number(report?.commission_rate ?? 0.3)}
        onSave={async (payload) => {
          try {
            await upsert.mutateAsync(payload as Parameters<typeof upsert.mutateAsync>[0]);
            toast.success(payload.id ? "Job updated" : "Job added");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not save job");
            throw e;
          }
        }}
        onDelete={async (jobId) => {
          try {
            await del.mutateAsync(jobId);
            toast.success("Job deleted");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not delete");
          }
        }}
      />
    </div>
  );
}

/**
 * Premium hero card combining the bidirectional weekly balance with the tech
 * net profit. Frontend-only — values come straight from the report row.
 *
 * Direction is resolved through `resolveBalance()` (the single source of
 * truth) — never inferred ad-hoc from a positive/negative number here.
 */
function HeroSummary({
  netBalance,
  direction,
  yourEarnings,
}: {
  netBalance: number;
  direction?: string | null;
  yourEarnings: number;
}) {
  // Trust the DB `balance_direction` as the report-level source of truth.
  const resolved = resolveBalance(netBalance, direction ?? undefined);
  const isSettled = resolved.direction === "SETTLED";
  const tone = resolved.tone;

  const label = isSettled ? "Balance settled" : resolved.labelTechnician;
  const amountText = fmtMoney(resolved.amount);
  const Icon = isSettled
    ? CheckCircle2
    : resolved.direction === "COMPANY_OWES_TECH"
    ? ArrowDownLeft
    : ArrowUpRight;

  // Accent strip + icon tinting per tone (kept on the deep-navy card).
  const accentStripCls =
    tone === "pos"
      ? "bg-money-pos"
      : tone === "neg"
      ? "bg-money-neg"
      : "bg-primary-foreground/30";

  const iconWrapCls =
    tone === "pos"
      ? "bg-money-pos/15 text-money-pos ring-money-pos/30"
      : tone === "neg"
      ? "bg-money-neg/15 text-money-neg ring-money-neg/30"
      : "bg-primary-foreground/10 text-primary-foreground/80 ring-primary-foreground/20";

  const amountCls =
    tone === "pos"
      ? "text-money-pos"
      : tone === "neg"
      ? "text-money-neg"
      : "text-primary-foreground";

  return (
    <Card className="overflow-hidden border-transparent shadow-lg">
      <div className="relative gradient-primary text-primary-foreground">
        {/* Accent strip */}
        <div className={cn("absolute inset-x-0 top-0 h-1", accentStripCls)} />

        <div className="grid gap-5 p-5 sm:grid-cols-[1fr_auto] sm:items-end sm:gap-8 sm:p-6">
          {/* Primary: balance */}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className={cn("flex h-7 w-7 items-center justify-center rounded-md ring-1", iconWrapCls)}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-80">
                {label}
              </div>
            </div>
            <div
              className={cn(
                "num mt-2 font-display text-4xl font-bold leading-none tabular-nums sm:text-5xl",
                amountCls,
              )}
            >
              {amountText}
            </div>
            <div className="mt-2 text-xs opacity-70">Weekly net balance</div>
          </div>

          {/* Secondary: technician earnings */}
          <div className="min-w-[180px] rounded-xl bg-primary-foreground/[0.07] p-4 ring-1 ring-primary-foreground/10 backdrop-blur-sm">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-70">
              Your earnings
            </div>
            <div className="num mt-1 font-display text-2xl font-bold tabular-nums sm:text-3xl">
              {fmtMoney(yourEarnings)}
            </div>
            <div className="mt-1 text-[11px] leading-snug opacity-65">
              Commission + your parts + tips
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
