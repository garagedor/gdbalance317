import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  useReport,
  useReportJobs,
  useActivityLog,
  useChangeStatus,
  useUpsertJob,
  useDeleteJob,
  type JobRow,
} from "@/hooks/useReports";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { StatusPill } from "@/components/StatusPill";
import { MoneyStat } from "@/components/MoneyStat";
import { JobsTable, type JobsTableRow } from "@/components/JobsTable";
import { JobSheet } from "@/components/JobSheet";
import { fmtWeekRange, fmtDateTime } from "@/lib/week";
import { fmtMoney, fmtPct, resolveBalance } from "@/lib/format";
import { computeTechnicianEarnings } from "@/lib/finance/calc";
import { computeLmSettlement } from "@/lib/finance/lmSettlement";
import { ArrowLeft, CheckCircle2, Eye, Loader2, Pencil, Plus, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useQueryClient } from "@tanstack/react-query";

export default function AdminReport() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { data: report, isLoading } = useReport(id);
  const { data: jobs } = useReportJobs(id);
  const { data: activity } = useActivityLog(id);
  const change = useChangeStatus(id);

  const { data: tech } = useQuery({
    enabled: !!report?.technician_id,
    queryKey: ["tech-meta", report?.technician_id, report?.area_id],
    queryFn: async () => {
      const [{ data: user, error: uErr }, areaRes] = await Promise.all([
        supabase
          .from("users")
          .select("id, full_name, email, phone, area_id")
          .eq("id", report!.technician_id)
          .maybeSingle(),
        report?.area_id
          ? supabase.from("areas").select("id, name, manager_profit_percent").eq("id", report!.area_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (uErr) throw uErr;
      if (areaRes.error) throw areaRes.error;
      return {
        id: user?.id ?? "",
        full_name: user?.full_name ?? "",
        email: user?.email ?? "",
        phone: user?.phone ?? null,
        area: (areaRes.data ?? null) as
          | { id: string; name: string; manager_profit_percent: number }
          | null,
      };
    },
  });

  const [returnOpen, setReturnOpen] = useState(false);
  const [note, setNote] = useState("");
  const [commOpen, setCommOpen] = useState(false);
  const [commValue, setCommValue] = useState("");
  const [commNote, setCommNote] = useState("");
  const [commSaving, setCommSaving] = useState(false);
  const [jobSheetOpen, setJobSheetOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<JobRow | null>(null);
  const upsertJob = useUpsertJob(id);
  const deleteJob = useDeleteJob(id);
  const qc = useQueryClient();

  const isOverridden = !!(activity ?? []).find((a) => a.action_type === "commission_override");

  const submitOverride = async () => {
    const pct = Number(commValue);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      toast.error("Enter a percentage between 0 and 100");
      return;
    }
    setCommSaving(true);
    try {
      const { error } = await supabase.rpc("admin_override_report_commission", {
        _report_id: id,
        _new_rate: pct / 100,
        _note: commNote.trim() || null,
      });
      if (error) throw error;
      toast.success("Commission updated for this report");
      setCommOpen(false);
      setCommNote("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["report", id] }),
        qc.invalidateQueries({ queryKey: ["report-jobs", id] }),
        qc.invalidateQueries({ queryKey: ["activity", id] }),
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update commission");
    } finally {
      setCommSaving(false);
    }
  };

  if (isLoading || !report) {
    return <div className="flex h-dvh items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  const canReview = report.status === "Submitted";
  const canDecide = report.status === "Submitted" || report.status === "Under Review";

  const doStatus = async (status: typeof report.status, manager_note?: string) => {
    try {
      await change.mutateAsync({ status, manager_note: manager_note ?? null });
      toast.success(`Marked ${status}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-background lg:h-dvh lg:overflow-hidden">
      <header className="sticky top-0 z-30 shrink-0 border-b bg-background/95 backdrop-blur safe-top pwa-pt-safe">
        <div className="mx-auto flex w-full max-w-none items-center gap-3 px-3 py-2 lg:px-4">
          <Button variant="ghost" size="icon" onClick={() => nav("/admin")} aria-label="Back"><ArrowLeft className="h-5 w-5" /></Button>
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-base font-semibold">{tech?.full_name ?? "Report"}</div>
            <div className="truncate text-xs text-muted-foreground">
              {tech?.area?.name ?? "—"} · {fmtWeekRange(report.week_start, report.week_end)}
            </div>
          </div>
          <StatusPill status={report.status} />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-none flex-1 flex-col gap-3 px-3 py-3 pb-28 lg:min-h-0 lg:overflow-hidden lg:px-4 lg:pb-3">
        {/* Tech meta — wide horizontal summary bar on desktop */}
        <Card className="shrink-0 rounded-lg">
          <CardContent className="grid grid-cols-2 gap-2 p-3 text-sm sm:grid-cols-3 lg:grid-cols-6 lg:gap-4">
            <Meta
              label="Technician"
              value={tech?.full_name || "—"}
              sub={tech?.email || ""}
            />
            <Meta label="Phone" value={tech?.phone || "—"} />
            <Meta label="Area" value={tech?.area?.name || "—"} />
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Commission</div>
              <div className="mt-0.5 flex items-center gap-2">
                <span className="font-medium">{fmtPct(report.commission_rate)}</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 gap-1 px-2 text-[11px]"
                  onClick={() => {
                    setCommValue(String(Math.round(Number(report.commission_rate) * 10000) / 100));
                    setCommOpen(true);
                  }}
                >
                  <Pencil className="h-3 w-3" /> Edit
                </Button>
              </div>
              <div className="text-xs text-muted-foreground">
                {isOverridden ? (
                  <span className="font-medium text-accent">Commission overridden for this report</span>
                ) : (
                  "Snapshotted at report creation"
                )}
              </div>
            </div>
            <Meta label="Submitted" value={report.submitted_at ? fmtDateTime(report.submitted_at) : "—"} />
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</div>
              <div className="mt-1"><StatusPill status={report.status} /></div>
            </div>
          </CardContent>
        </Card>

        {/* Hero summary */}
        {(() => {
          const bal = resolveBalance(report.net_balance, report.balance_direction);
          const balanceLine =
            bal.direction === "SETTLED"
              ? `Settled: ${fmtMoney(0)}`
              : `${bal.labelManager}: ${fmtMoney(bal.amount)}`;
          return (
            <Card className="shrink-0 overflow-hidden rounded-lg border-transparent shadow-md">
              <div className="gradient-primary px-4 py-3 text-primary-foreground">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-wider opacity-70">Balance</div>
                    <div className="num mt-0.5 font-display text-3xl font-bold tabular-nums">{fmtMoney(bal.amount)}</div>
                    <div className="text-sm font-semibold">{balanceLine}</div>
                    <div className="text-xs opacity-70">Technician Earnings · {fmtMoney(computeTechnicianEarnings(report))}</div>
                  </div>
                  <div className="num grid grid-cols-2 gap-x-6 gap-y-1 text-right text-xs opacity-90 sm:grid-cols-3">
                    <div><div className="opacity-70">Sales</div><div className="font-semibold tabular-nums">{fmtMoney(Number(report.total_sales))}</div></div>
                    <div><div className="opacity-70">Tips</div><div className="font-semibold tabular-nums">{fmtMoney(Number(report.total_tips))}</div></div>
                    <div><div className="opacity-70">Card fee</div><div className="font-semibold tabular-nums">{fmtMoney(Number(report.total_card_fee))}</div></div>
                  </div>
                </div>
              </div>
              <CardContent className="grid grid-cols-2 gap-2 p-2 sm:grid-cols-4 lg:grid-cols-8">
                <MoneyStat className="rounded-lg p-2.5" label="Tech gross" value={Number(report.tech_gross_payout)} />
                <MoneyStat className="rounded-lg p-2.5" label={`Tech ${fmtPct(report.commission_rate)}`} value={Number(report.total_tech_30)} />
                <MoneyStat className="rounded-lg p-2.5" label={`Company ${fmtPct(1 - Number(report.commission_rate))}`} value={Number(report.total_company_70)} />
                <MoneyStat className="rounded-lg p-2.5" label="Tech cash collected" value={Number(report.tech_cash_collected)} />
                <MoneyStat className="rounded-lg p-2.5" label="Company cash collected" value={Number(report.company_cash_collected)} />
                <MoneyStat className="rounded-lg p-2.5" label="Total my parts" value={Number(report.total_my_parts)} />
                <MoneyStat className="rounded-lg p-2.5" label="Total company parts" value={Number(report.total_company_parts)} />
                <MoneyStat className="rounded-lg p-2.5" label={balanceLine} value={bal.amount} emphasis="money" />
              </CardContent>
            </Card>
          );
        })()}

        {/* LM totals + Company ↔ LM settlement */}
        {(() => {
          const jobList = jobs ?? [];
          const lmCash = jobList.reduce((a, j) => a + Number((j as { lm_cash?: number | null }).lm_cash ?? 0), 0);
          const lmCheck = jobList.reduce((a, j) => a + Number((j as { lm_check?: number | null }).lm_check ?? 0), 0);
          const lmParts = jobList.reduce((a, j) => a + Number((j as { lm_parts?: number | null }).lm_parts ?? 0), 0);
          if (lmCash === 0 && lmCheck === 0 && lmParts === 0) return null;
          const pct = Number(tech?.area?.manager_profit_percent ?? 40);
          const isApproved = report.status === "Approved";
          const settlement = computeLmSettlement(
            jobList.map((j) => ({
              lm_cash: Number((j as { lm_cash?: number | null }).lm_cash ?? 0),
              lm_check: Number((j as { lm_check?: number | null }).lm_check ?? 0),
              lm_parts: Number((j as { lm_parts?: number | null }).lm_parts ?? 0),
              total_profit: Number(j.total_profit ?? 0),
              is_approved: isApproved,
            })),
            pct,
          );
          const netDir =
            settlement.net_lm_balance > 0.005
              ? { label: "Company pays LM", emphasis: "success" as const }
              : settlement.net_lm_balance < -0.005
              ? { label: "LM pays Company", emphasis: "danger" as const }
              : { label: "Settled", emphasis: "default" as const };
          return (
            <Card className="shrink-0 rounded-lg border-transparent shadow-md">
              <CardContent className="space-y-3 p-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-sm font-semibold">Location Manager</h3>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-secondary-foreground">
                    LM share {pct}%
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  <MoneyStat className="rounded-lg p-2.5" label="LM cash" value={lmCash} />
                  <MoneyStat className="rounded-lg p-2.5" label="LM check" value={lmCheck} />
                  <MoneyStat className="rounded-lg p-2.5" label="LM parts" value={lmParts} />
                  <MoneyStat className="rounded-lg p-2.5" label="LM owes Company" value={settlement.lm_owes_company} />
                  <MoneyStat
                    className="rounded-lg p-2.5"
                    label="Company owes LM"
                    value={settlement.company_owes_lm}
                    hint={isApproved ? undefined : "Profit share unlocks on approval"}
                  />
                  <MoneyStat
                    className="rounded-lg p-2.5"
                    label={`Net · ${netDir.label}`}
                    value={Math.abs(settlement.net_lm_balance)}
                    emphasis={netDir.emphasis}
                  />
                </div>
              </CardContent>
            </Card>
          );
        })()}

        {/* Returned note (if any) */}
        {report.manager_note && (
          <Card className="shrink-0 rounded-lg">
            <CardContent className="p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Manager note</div>
              <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm">{report.manager_note}</p>
            </CardContent>
          </Card>
        )}

        {/* Jobs table — admin can add/edit/delete jobs in any status */}
        <section className="flex flex-col lg:min-h-0 lg:flex-1">
          <div className="mb-2 flex shrink-0 items-center justify-between px-1">
            <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Jobs ({jobs?.length ?? 0})
            </h2>
            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              onClick={() => {
                setEditingJob(null);
                setJobSheetOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Add job
            </Button>
          </div>
          <JobsTable
            rows={(jobs ?? []).map<JobsTableRow>((j) => ({
              id: j.id,
              job_date: j.job_date,
              address: j.address,
              customer_name: j.customer_name,
              tech_paid_cash: Number(j.tech_paid_cash ?? 0),
              paid_card: Number(j.paid_card ?? 0),
              paid_company_cash: Number(j.paid_company_cash ?? 0),
              paid_company_check: Number(j.paid_company_check ?? 0),
              paid_finance: Number(j.paid_finance ?? 0),
              job_total: Number(j.job_total ?? 0),
              tech_parts: Number(j.tech_parts ?? 0),
              company_parts: Number(j.company_parts ?? 0),
              payment_fee: Number(j.payment_fee ?? 0),
              total_profit: Number(j.total_profit ?? 0),
              tech_payout_new: Number(j.tech_payout_new ?? 0),
              cash: Number(j.cash ?? 0),
              balance: Number(j.balance ?? 0),
              tips_total: Number(j.tips_total ?? 0),
              balance_plus_tips: Number(j.balance_plus_tips ?? 0),
              lm_cash: Number((j as { lm_cash?: number | null }).lm_cash ?? 0),
              lm_check: Number((j as { lm_check?: number | null }).lm_check ?? 0),
              lm_parts: Number((j as { lm_parts?: number | null }).lm_parts ?? 0),
              report_status: report.status,
            }))}
            onEdit={(jobId) => {
              const j = (jobs ?? []).find((x) => x.id === jobId) ?? null;
              setEditingJob(j);
              setJobSheetOpen(true);
            }}
            onDelete={async (jobId) => {
              if (!confirm("Delete this job?")) return;
              try {
                await deleteJob.mutateAsync(jobId);
                toast.success("Job deleted");
                await supabase.from("report_activity_log").insert({
                  weekly_report_id: id,
                  action_type: "admin_edit:delete_job",
                  action_by_user_id: (await supabase.auth.getUser()).data.user?.id,
                  note: `Admin deleted job ${jobId}`,
                });
                qc.invalidateQueries({ queryKey: ["activity", id] });
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Could not delete job");
              }
            }}
            emptyHint="No jobs."
            compact
            className="lg:min-h-0 lg:flex-1 lg:max-h-none lg:overflow-auto"
          />
        </section>

        {/* Activity log */}
        <section className="hidden shrink-0 xl:block">
          <h2 className="mb-1 px-1 font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">Activity log</h2>
          <Card className="rounded-lg">
            <CardContent className="p-0">
              <ul className="divide-y">
                {(activity ?? []).slice(0, 2).map((a) => (
                  <li key={a.id} className="flex flex-col gap-0.5 px-3 py-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{a.action_type}</span>
                      <span className="text-xs text-muted-foreground">{fmtDateTime(a.created_at)}</span>
                    </div>
                    {a.note && <div className="whitespace-pre-wrap text-xs text-muted-foreground">{a.note}</div>}
                  </li>
                ))}
                {(!activity || activity.length === 0) && (
                  <li className="px-4 py-8 text-center text-sm text-muted-foreground">No activity yet.</li>
                )}
              </ul>
            </CardContent>
          </Card>
        </section>
      </main>

      {/* Sticky action bar */}
      {canDecide && (
        <div className="sticky bottom-0 z-20 shrink-0 border-t bg-background/95 backdrop-blur safe-bottom pwa-pb-safe lg:static">
          <div className="mx-auto flex w-full max-w-none flex-wrap items-center gap-2 px-3 py-2 lg:px-4">
            {canReview && (
              <Button variant="outline" onClick={() => doStatus("Under Review")} disabled={change.isPending}>
                <Eye className="h-4 w-4" /> Under review
              </Button>
            )}
            <Button variant="outline" className="text-destructive hover:bg-destructive/10" onClick={() => setReturnOpen(true)} disabled={change.isPending}>
              <Undo2 className="h-4 w-4" /> Return
            </Button>
            <div className="flex-1" />
            <Button className="gap-2 gradient-accent text-accent-foreground shadow-glow hover:opacity-95" onClick={() => doStatus("Approved")} disabled={change.isPending}>
              {change.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4" /> Approve</>}
            </Button>
          </div>
        </div>
      )}

      {/* Return dialog */}
      <AlertDialog open={returnOpen} onOpenChange={setReturnOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Return for correction</AlertDialogTitle>
            <AlertDialogDescription>The technician will see this note and can edit the report again.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="return-note">Manager note (required)</Label>
            <Textarea id="return-note" rows={4} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="What needs to be corrected?" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!note.trim() || change.isPending}
              onClick={async (e) => {
                e.preventDefault();
                if (!note.trim()) return;
                await doStatus("Returned", note.trim());
                setReturnOpen(false);
                setNote("");
              }}
            >
              Return report
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Commission override dialog */}
      <AlertDialog open={commOpen} onOpenChange={setCommOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Edit Report Commission %</AlertDialogTitle>
            <AlertDialogDescription>
              This changes the commission for <strong>this report only</strong>. All totals, technician
              earnings, and net balance will recalculate immediately. The technician's default rate
              and other reports are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="comm-pct">New commission %</Label>
              <Input
                id="comm-pct"
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                step="0.01"
                value={commValue}
                onChange={(e) => setCommValue(e.target.value)}
                placeholder="e.g. 35"
              />
              <p className="text-xs text-muted-foreground">
                Current: {fmtPct(report.commission_rate)} · Enter a value between 0 and 100.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="comm-note">Reason (optional)</Label>
              <Textarea
                id="comm-note"
                rows={3}
                value={commNote}
                onChange={(e) => setCommNote(e.target.value)}
                maxLength={500}
                placeholder="Why is this being overridden?"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={commSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={commSaving || commValue === ""}
              onClick={(e) => {
                e.preventDefault();
                submitOverride();
              }}
            >
              {commSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save commission"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Admin job edit sheet — bypasses status guards via management RLS */}
      <JobSheet
        open={jobSheetOpen}
        onOpenChange={setJobSheetOpen}
        reportId={id}
        job={editingJob}
        defaultDate={report.week_start}
        commissionRate={Number(report.commission_rate)}
        busy={upsertJob.isPending}
        onSave={async (payload) => {
          try {
            await upsertJob.mutateAsync(payload as Parameters<typeof upsertJob.mutateAsync>[0]);
            toast.success(editingJob ? "Job updated" : "Job added");
            await supabase.from("report_activity_log").insert({
              weekly_report_id: id,
              action_type: editingJob ? "admin_edit:update_job" : "admin_edit:add_job",
              action_by_user_id: (await supabase.auth.getUser()).data.user?.id,
              note: `Admin ${editingJob ? "edited" : "added"} job ${editingJob?.id ?? ""}`.trim(),
            });
            qc.invalidateQueries({ queryKey: ["activity", id] });
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not save job");
            throw e;
          }
        }}
        onDelete={async (jobId) => {
          try {
            await deleteJob.mutateAsync(jobId);
            toast.success("Job deleted");
            await supabase.from("report_activity_log").insert({
              weekly_report_id: id,
              action_type: "admin_edit:delete_job",
              action_by_user_id: (await supabase.auth.getUser()).data.user?.id,
              note: `Admin deleted job ${jobId}`,
            });
            qc.invalidateQueries({ queryKey: ["activity", id] });
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not delete job");
          }
        }}
      />
    </div>
  );
}

function Meta({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-medium">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
