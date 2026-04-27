import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useReport, useReportJobs, useActivityLog, useChangeStatus } from "@/hooks/useReports";
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
import { fmtWeekRange, fmtDateTime } from "@/lib/week";
import { fmtMoney, fmtPct, resolveBalance } from "@/lib/format";
import { computeTechnicianEarnings } from "@/lib/finance/calc";
import { ArrowLeft, CheckCircle2, Eye, Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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
          ? supabase.from("areas").select("id, name").eq("id", report!.area_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (uErr) throw uErr;
      if (areaRes.error) throw areaRes.error;
      return {
        id: user?.id ?? "",
        full_name: user?.full_name ?? "",
        email: user?.email ?? "",
        phone: user?.phone ?? null,
        area: areaRes.data ?? null,
      } as { id: string; full_name: string; email: string; phone: string | null; area: { id: string; name: string } | null };
    },
  });

  const [returnOpen, setReturnOpen] = useState(false);
  const [note, setNote] = useState("");

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
    <div className="min-h-dvh bg-background pb-32">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur safe-top">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-3">
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

      <main className="mx-auto w-full max-w-5xl space-y-5 px-5 py-5">
        {/* Tech meta */}
        <Card>
          <CardContent className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-4">
            <Meta label="Technician" value={tech?.full_name ?? "—"} sub={tech?.email ?? ""} />
            <Meta label="Area" value={tech?.area?.name ?? "—"} />
            <Meta label="Commission" value={fmtPct(report.commission_rate)} sub="Snapshotted at report creation" />
            <Meta label="Submitted" value={report.submitted_at ? fmtDateTime(report.submitted_at) : "—"} />
          </CardContent>
        </Card>

        {/* Hero summary */}
        <Card className="overflow-hidden border-transparent shadow-md">
          <div className="gradient-primary px-5 py-5 text-primary-foreground">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wider opacity-70">Net balance</div>
                <div className="num mt-1 font-display text-4xl font-bold tabular-nums">{fmtMoney(Number(report.net_balance))}</div>
                <div className="mt-1 text-xs opacity-70">Technician Earnings · {fmtMoney(computeTechnicianEarnings(report))}</div>
              </div>
              <div className="num grid grid-cols-2 gap-x-6 gap-y-1 text-right text-xs opacity-90 sm:grid-cols-3">
                <div><div className="opacity-70">Sales</div><div className="font-semibold tabular-nums">{fmtMoney(Number(report.total_sales))}</div></div>
                <div><div className="opacity-70">Tips</div><div className="font-semibold tabular-nums">{fmtMoney(Number(report.total_tips))}</div></div>
                <div><div className="opacity-70">Card fee</div><div className="font-semibold tabular-nums">{fmtMoney(Number(report.total_card_fee))}</div></div>
              </div>
            </div>
          </div>
          <CardContent className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-4">
            <MoneyStat label="Tech gross" value={Number(report.tech_gross_payout)} />
            <MoneyStat label={`Tech ${fmtPct(report.commission_rate)}`} value={Number(report.total_tech_30)} />
            <MoneyStat label={`Company ${fmtPct(1 - Number(report.commission_rate))}`} value={Number(report.total_company_70)} />
            <MoneyStat label="Tech cash collected" value={Number(report.tech_cash_collected)} />
            <MoneyStat label="Company cash collected" value={Number(report.company_cash_collected)} />
            <MoneyStat label="Total my parts" value={Number(report.total_my_parts)} />
            <MoneyStat label="Total company parts" value={Number(report.total_company_parts)} />
            <MoneyStat label="Net balance" value={Number(report.net_balance)} emphasis="money" />
          </CardContent>
        </Card>

        {/* Returned note (if any) */}
        {report.manager_note && (
          <Card>
            <CardContent className="p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Manager note</div>
              <p className="mt-1 whitespace-pre-wrap text-sm">{report.manager_note}</p>
            </CardContent>
          </Card>
        )}

        {/* Jobs table — same columns and engine outputs as Office Jobs */}
        <section>
          <h2 className="mb-2 px-1 font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">Jobs ({jobs?.length ?? 0})</h2>
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
              report_status: report.status,
            }))}
            emptyHint="No jobs."
          />
        </section>

        {/* Activity log */}
        <section>
          <h2 className="mb-2 px-1 font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">Activity log</h2>
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y">
                {(activity ?? []).map((a) => (
                  <li key={a.id} className="flex flex-col gap-0.5 px-4 py-3 text-sm">
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
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur safe-bottom">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-5 py-3">
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
