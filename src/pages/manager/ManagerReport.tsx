import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useReport, useReportJobs, useActivityLog } from "@/hooks/useReports";
import { usePayoutUpdate } from "@/hooks/useManager";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusPill } from "@/components/StatusPill";
import { BalanceCallout } from "@/components/BalanceCallout";
import { MoneyStat } from "@/components/MoneyStat";
import { JobsTable, type JobsTableRow } from "@/components/JobsTable";
import { fmtWeekRange, fmtDateTime } from "@/lib/week";
import { fmtMoney, fmtPct, resolveBalance } from "@/lib/format";
import { computeTechnicianEarnings } from "@/lib/finance/calc";
import { ArrowLeft, CheckCircle2, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function ManagerReport() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { data: report, isLoading } = useReport(id);
  const { data: jobs } = useReportJobs(id);
  const { data: activity } = useActivityLog(id);
  const payout = usePayoutUpdate(id);

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

  // Local form state for payout fields
  const [amountText, setAmountText] = useState("");
  const [note, setNote] = useState("");
  const [statusOverride, setStatusOverride] = useState<"auto" | "open" | "partial" | "settled">("auto");

  useEffect(() => {
    if (report) {
      setAmountText(Number(report.amount_transferred) > 0 ? Number(report.amount_transferred).toFixed(2) : "");
      setNote(report.payment_note ?? "");
      setStatusOverride("auto");
    }
  }, [report]);

  if (isLoading || !report) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isApproved = report.status === "Approved";
  const netBalance = Number(report.net_balance);
  // Trust the DB `balance_direction` at report level — sign convention there
  // is inverted vs. per-job `balance`.
  const balanceInfo = resolveBalance(netBalance, report.balance_direction);
  const absBalance = balanceInfo.amount;
  const transferred = Number(report.amount_transferred);
  const remaining = Math.max(absBalance - transferred, 0);

  const onSendToTech = async () => {
    try {
      await payout.mutateAsync({ report_sent_to_technician: true });
      toast.success("Marked as sent to technician");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not update");
    }
  };

  const onSavePayment = async () => {
    const amt = parseFloat(amountText || "0");
    if (!Number.isFinite(amt) || amt < 0) {
      toast.error("Enter a valid amount");
      return;
    }
    try {
      const patch: any = { amount_transferred: amt, payment_note: note || null };
      if (statusOverride !== "auto") patch.balance_payment_status = statusOverride;
      await payout.mutateAsync(patch);
      toast.success("Payment saved");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save payment");
    }
  };

  const statusBadge =
    report.balance_payment_status === "settled"
      ? "bg-money-pos/15 text-money-pos"
      : report.balance_payment_status === "partial"
      ? "bg-amber-500/15 text-amber-600"
      : "bg-muted text-muted-foreground";

  return (
    <div className="min-h-dvh bg-background pb-16">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur safe-top">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-3">
          <Button variant="ghost" size="icon" onClick={() => nav("/manager")} aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
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
        {/* Balance callout */}
        <BalanceCallout
          netBalance={netBalance}
          direction={report.balance_direction}
          audience="manager"
        />

        {/* Summary */}
        <Card className="overflow-hidden border-transparent shadow-md">
          <CardContent className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-4">
            <MoneyStat label="Total sales" value={Number(report.total_sales)} />
            <MoneyStat label="Total tips" value={Number(report.total_tips)} />
            <MoneyStat label="Card fee" value={Number(report.total_card_fee)} />
            <MoneyStat label="Tech gross" value={Number(report.tech_gross_payout)} />
            <MoneyStat label="Technician Earnings" value={computeTechnicianEarnings(report)} emphasis="success" />
            <MoneyStat label={`Tech ${fmtPct(report.commission_rate)}`} value={Number(report.total_tech_30)} />
            <MoneyStat label={`Company ${fmtPct(1 - Number(report.commission_rate))}`} value={Number(report.total_company_70)} />
            <MoneyStat label="Tech cash collected" value={Number(report.tech_cash_collected)} />
            <MoneyStat
              label="Net balance"
              value={absBalance}
              hint={balanceInfo.labelManager}
              emphasis={
                balanceInfo.direction === "COMPANY_OWES_TECH"
                  ? "success"
                  : balanceInfo.direction === "TECH_OWES_COMPANY"
                  ? "danger"
                  : "default"
              }
            />
          </CardContent>
        </Card>

        {/* Commission rate snapshot (read-only for area manager) */}
        <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
          <span>Technician commission for this week:</span>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-secondary-foreground">
            {fmtPct(report.commission_rate)}
          </span>
        </div>

        {/* Payout tracking — only meaningful after approval */}
        {isApproved ? (
          <Card>
            <CardContent className="space-y-5 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-display text-base font-semibold">Payout tracking</h2>
                  <p className="text-xs text-muted-foreground">Record how money moved after approval.</p>
                </div>
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider", statusBadge)}>
                  {report.balance_payment_status}
                </span>
              </div>

              {/* Send to tech */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">Send report to technician</div>
                  <div className="text-xs text-muted-foreground">
                    {report.report_sent_to_technician
                      ? `Sent ${report.report_sent_at ? fmtDateTime(report.report_sent_at) : ""}`
                      : "Not yet sent"}
                  </div>
                </div>
                {report.report_sent_to_technician ? (
                  <span className="inline-flex items-center gap-1 text-xs text-money-pos">
                    <CheckCircle2 className="h-4 w-4" /> Sent
                  </span>
                ) : (
                  <Button onClick={onSendToTech} disabled={payout.isPending} size="sm">
                    <Send className="h-4 w-4" /> Send
                  </Button>
                )}
              </div>

              {/* Payment recording */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Stat label="Net balance" value={fmtMoney(absBalance)} />
                <Stat label="Already transferred" value={fmtMoney(transferred)} />
                <Stat label="Remaining" value={fmtMoney(remaining)} cls={remaining < 0.005 ? "text-money-pos" : "text-money-neg"} />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="sm:col-span-1">
                  <Label htmlFor="amount">Amount transferred</Label>
                  <Input
                    id="amount"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={amountText}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9.]/g, "");
                      const parts = v.split(".");
                      const clean = parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : v;
                      const limited = clean.includes(".") ? clean.slice(0, clean.indexOf(".") + 3) : clean;
                      setAmountText(limited);
                    }}
                  />
                </div>
                <div className="sm:col-span-1">
                  <Label htmlFor="status">Status</Label>
                  <Select value={statusOverride} onValueChange={(v) => setStatusOverride(v as any)}>
                    <SelectTrigger id="status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto-derive</SelectItem>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="partial">Partial</SelectItem>
                      <SelectItem value="settled">Settled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-1">
                  <Label htmlFor="note">Note (optional)</Label>
                  <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Cash, Zelle, etc." />
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={onSavePayment} disabled={payout.isPending} className="gradient-accent text-accent-foreground shadow-glow">
                  {payout.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save payment"}
                </Button>
              </div>

              {report.payment_sent_at && (
                <div className="text-[11px] text-muted-foreground">
                  Last payment recorded {fmtDateTime(report.payment_sent_at)}
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="border-dashed">
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              Payout tracking unlocks once an admin approves this report.
            </CardContent>
          </Card>
        )}

        {/* Jobs — same columns and engine outputs as Office Jobs */}
        <section>
          <h2 className="mb-2 px-1 font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Jobs ({jobs?.length ?? 0})
          </h2>
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

        {/* Activity */}
        <section>
          <h2 className="mb-2 px-1 font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Activity log
          </h2>
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
    </div>
  );
}

function Stat({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("num mt-0.5 font-display text-lg font-semibold tabular-nums", cls)}>{value}</div>
    </div>
  );
}
