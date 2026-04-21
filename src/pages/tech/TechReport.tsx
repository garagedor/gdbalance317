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
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { StatusPill } from "@/components/StatusPill";
import { MoneyStat } from "@/components/MoneyStat";
import { BalanceCallout } from "@/components/BalanceCallout";
import { JobSheet } from "@/components/JobSheet";
import { fmtWeekRange, fmtDate } from "@/lib/week";
import { fmtMoney, moneyClass } from "@/lib/format";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  Loader2,
  Plus,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function TechReport() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { data: report, isLoading } = useReport(id);
  const { data: jobs, isLoading: jobsLoading } = useReportJobs(id);
  const upsert = useUpsertJob(id);
  const del = useDeleteJob(id);
  const changeStatus = useChangeStatus(id);
  const validate = useValidateForSubmission(id);
  const [editing, setEditing] = useState<JobRow | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const editable = report?.status === "Draft" || report?.status === "Returned";
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
    <div className="min-h-dvh bg-background pb-44">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur safe-top">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-5 py-3">
          <Button variant="ghost" size="icon" onClick={() => nav("/tech")} aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-base font-semibold">
              {fmtWeekRange(report.week_start, report.week_end)}
            </div>
            <div className="text-xs text-muted-foreground">{jobs?.length ?? 0} jobs</div>
          </div>
          <StatusPill status={report.status} />
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

        {/* Bidirectional balance message */}
        <BalanceCallout netBalance={Number(report.net_balance)} audience="technician" />

        {/* Hero summary */}
        <Card className="overflow-hidden border-transparent shadow-md">
          <div className="gradient-primary px-5 py-5 text-primary-foreground">
            <div className="text-[11px] font-medium uppercase tracking-wider opacity-70">Tech net profit</div>
            <div className="num mt-1 font-display text-4xl font-bold tabular-nums">
              {fmtMoney(Number(report.tech_net_profit))}
            </div>
            <div className="mt-1 text-xs opacity-70">Earnings after parts reimbursement</div>
          </div>
          <CardContent className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-4">
            <MoneyStat label="Total sales" value={Number(report.total_sales) - Number(report.total_tips)} />
            <MoneyStat label="Total tips" value={Number(report.total_tips)} />
            <MoneyStat label="Card fee" value={Number(report.total_card_fee)} />
            <MoneyStat label="Tech gross" value={Number(report.tech_gross_payout)} />
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
              {jobs.map((j) => (
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
                          {j.payment_type}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate font-medium">{j.customer_name || "Unnamed customer"}</div>
                      {j.address && <div className="truncate text-xs text-muted-foreground">{j.address}</div>}
                    </div>
                    <div className="text-right num">
                      <div className="font-semibold tabular-nums">{fmtMoney(Number(j.total_job) - Number(j.tip_amount))}</div>
                      <div className="text-xs tabular-nums text-muted-foreground">TIP: {fmtMoney(Number(j.tip_amount))}</div>
                      <div className="text-[10px] tabular-nums text-muted-foreground/70">Total with tip: {fmtMoney(Number(j.total_job))}</div>
                      <div className={cn("mt-1 text-xs tabular-nums", moneyClass(Number(j.job_balance)))}>{fmtMoney(Number(j.job_balance))}</div>
                    </div>
                    {editable && <ChevronRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Detailed totals */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <MoneyStat label="Total my parts" value={Number(report.total_my_parts)} />
          <MoneyStat label="Total company parts" value={Number(report.total_company_parts)} />
          <MoneyStat label="Tech 30%" value={Number(report.total_tech_30)} />
          <MoneyStat label="Company 70%" value={Number(report.total_company_70)} />
          <MoneyStat label="Tech cash collected" value={Number(report.tech_cash_collected)} />
          <MoneyStat label="Company cash collected" value={Number(report.company_cash_collected)} />
        </section>
      </main>

      {/* Sticky submit bar */}
      {editable && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur safe-bottom">
          <div className="mx-auto flex max-w-2xl items-center gap-3 px-5 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Net balance</div>
              <div className={cn("num text-lg font-semibold tabular-nums", moneyClass(Number(report.net_balance)))}>
                {fmtMoney(Number(report.net_balance))}
              </div>
            </div>
            <Button
              size="lg"
              className="h-12 flex-1 gap-2 gradient-accent text-accent-foreground shadow-glow hover:opacity-95"
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
