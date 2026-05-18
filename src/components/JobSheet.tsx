/**
 * Technician job entry sheet — Phase 4 input model.
 * Fast, mobile-first, minimal taps. Live preview from local engine; backend
 * trigger recomputes everything on save.
 */
import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  computeNewJob,
  derivePayMethod,
  DEFAULT_COMMISSION_RATE,
  type NewJobInput,
} from "@/lib/finance";
import { fmtMoney, fmtMoneyTechFavor, balanceClassTechFavor } from "@/lib/format";
import type { JobRow } from "@/hooks/useReports";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  reportId: string;
  job?: JobRow | null;
  onSave: (payload: Partial<JobRow> & { id?: string }) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  defaultDate: string;
  busy?: boolean;
  /** Snapshotted commission rate from the parent report (e.g. 0.30). */
  commissionRate?: number;
}

type Form = NewJobInput & {
  job_date: string;
  customer_name: string;
  address: string;
  notes: string;
  lm_cash: number;
  lm_check: number;
  lm_parts: number;
};

const emptyForm = (date: string, rate: number): Form => ({
  job_date: date,
  customer_name: "",
  address: "",
  notes: "",
  tech_paid_cash: 0,
  paid_card: 0,
  paid_company_cash: 0,
  paid_company_check: 0,
  paid_finance: 0,
  tech_parts: 0,
  company_parts: 0,
  tips_card: 0,
  tips_finance: 0,
  tips_company_cash: 0,
  tips_check: 0,
  commission_rate: rate,
  lm_cash: 0,
  lm_check: 0,
  lm_parts: 0,
});

export function JobSheet({
  open,
  onOpenChange,
  reportId: _reportId,
  job,
  onSave,
  onDelete,
  defaultDate,
  busy,
  commissionRate,
}: Props) {
  const rate = commissionRate ?? DEFAULT_COMMISSION_RATE;
  const [form, setForm] = useState<Form>(() => emptyForm(defaultDate, rate));
  const [moneyText, setMoneyText] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    if (job) {
      // Read the new fields if present, fall back to mirrored legacy fields.
      const j = job as unknown as Record<string, number | string | null>;
      const num = (k: string) => Number(j[k] ?? 0) || 0;
      setForm({
        job_date: job.job_date,
        customer_name: job.customer_name ?? "",
        address: job.address ?? "",
        notes: job.notes ?? "",
        tech_paid_cash: num("tech_paid_cash") || num("cash_amount"),
        paid_card: num("paid_card") || num("card_amount"),
        paid_company_cash: num("paid_company_cash"),
        paid_company_check: num("paid_company_check"),
        paid_finance: num("paid_finance"),
        tech_parts: num("tech_parts") || num("my_parts"),
        company_parts: num("company_parts"),
        tips_card: num("tips_card") || num("card_tip_amount"),
        tips_finance: num("tips_finance"),
        tips_company_cash: num("tips_company_cash") || num("cash_tip_amount"),
        tips_check: num("tips_check"),
        commission_rate: num("commission_rate") || rate,
        lm_cash: num("lm_cash"),
        lm_check: num("lm_check"),
        lm_parts: num("lm_parts"),
      });
    } else {
      setForm(emptyForm(defaultDate, rate));
    }
    setMoneyText({});
  }, [open, job, defaultDate, rate]);

  const preview = useMemo(() => computeNewJob(form), [form]);
  const payMethod = useMemo(() => derivePayMethod(form), [form]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((p) => ({ ...p, [k]: v }));
  const setNum = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    let v = e.target.value.replace(/[^0-9.]/g, "");
    const dot = v.indexOf(".");
    if (dot !== -1) {
      v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, "");
      const [a, b = ""] = v.split(".");
      v = a + "." + b.slice(0, 2);
    }
    setMoneyText((p) => ({ ...p, [k as string]: v }));
    const n = v === "" || v === "." ? 0 : Number(v);
    set(k, (Number.isFinite(n) ? n : 0) as Form[typeof k]);
  };
  const moneyVal = (k: keyof Form): string => {
    const t = moneyText[k as string];
    if (t !== undefined) return t;
    const n = form[k] as unknown as number;
    return n === 0 || n === undefined ? "" : String(n);
  };

  const submit = async () => {
    if (!form.job_date) {
      toast.error("Pick a date");
      return;
    }
    if (preview.job_total <= 0) {
      toast.error("Enter at least one payment amount");
      return;
    }
    // Send only inputs; DB trigger fills derived columns. We also send legacy
    // fields the schema requires (payment_type / tip_type are derived in DB
    // but the column is NOT NULL on insert, so set a safe sentinel).
    const payload = {
      id: job?.id,
      job_date: form.job_date,
      customer_name: form.customer_name || null,
      address: form.address || null,
      notes: form.notes || null,
      // New input model
      tech_paid_cash: form.tech_paid_cash,
      paid_card: form.paid_card,
      paid_company_cash: form.paid_company_cash,
      paid_company_check: form.paid_company_check,
      paid_finance: form.paid_finance,
      tech_parts: form.tech_parts,
      company_parts: form.company_parts,
      tips_card: form.tips_card,
      tips_finance: form.tips_finance,
      tips_company_cash: form.tips_company_cash,
      tips_check: form.tips_check,
      commission_rate: form.commission_rate,
      lm_cash: form.lm_cash,
      lm_check: form.lm_check,
      lm_parts: form.lm_parts,
      // Required-NOT-NULL legacy columns (DB trigger will overwrite):
      payment_type: "Card" as const,
      tip_type: "None" as const,
      total_job: preview.job_total,
      card_amount: form.paid_card,
      cash_amount: form.tech_paid_cash,
      tip_amount: 0,
      card_tip_amount: form.tips_card + form.tips_finance,
      cash_tip_amount: form.tips_company_cash + form.tips_check,
      my_parts: form.tech_parts,
      tech_cash: form.tech_paid_cash,
      company_cash: form.paid_company_cash,
      card_fee_rate: 0.05,
    };
    await onSave(payload as unknown as Partial<JobRow> & { id?: string });
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[94dvh] overflow-y-auto rounded-t-3xl p-0 sm:h-[90dvh] sm:max-w-2xl sm:rounded-t-3xl sm:left-1/2 sm:right-auto sm:-translate-x-1/2"
      >
        <SheetHeader className="sticky top-0 z-10 border-b bg-card/95 px-5 py-4 backdrop-blur-md safe-top">
          <div className="flex items-center justify-between gap-2">
            <div>
              <SheetTitle className="font-display text-base font-bold">{job ? "Edit job" : "Add job"}</SheetTitle>
              <SheetDescription className="text-[11px]">
                {payMethod !== "—" ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                      {payMethod}
                    </span>
                    <span>Server recomputes on save</span>
                  </span>
                ) : (
                  "Server recomputes on save."
                )}
              </SheetDescription>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Balance + Tips</div>
              <div className={cn("font-display text-lg font-bold tabular-nums", balanceClassTechFavor(preview.balance_plus_tips))}>
                {fmtMoneyTechFavor(preview.balance_plus_tips)}
              </div>
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-4 px-4 py-4 pb-6">
          {/* Date + customer (compact) */}
          <section className="grid grid-cols-2 gap-2">
            <Field label="Date">
              <Input type="date" value={form.job_date} onChange={(e) => set("job_date", e.target.value)} required className="h-11" />
            </Field>
            <Field label="Customer">
              <Input value={form.customer_name} onChange={(e) => set("customer_name", e.target.value)} maxLength={200} className="h-11" />
            </Field>
            <Field label="Address" wide>
              <Input value={form.address} onChange={(e) => set("address", e.target.value)} maxLength={500} className="h-11" />
            </Field>
          </section>

          <Separator />

          {/* PAYMENTS — the meat. One row per source. */}
          <section>
            <SectionTitle>Payments</SectionTitle>
            <p className="-mt-1 mb-2 text-[11px] leading-snug text-muted-foreground">
              Enter payment amount <span className="font-semibold text-foreground">excluding tips</span>. Enter tips separately below.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Tech cash">
                <MoneyInput value={moneyVal("tech_paid_cash")} onChange={setNum("tech_paid_cash")} />
              </Field>
              <Field label="Card">
                <MoneyInput value={moneyVal("paid_card")} onChange={setNum("paid_card")} />
              </Field>
              <Field label="Company cash">
                <MoneyInput value={moneyVal("paid_company_cash")} onChange={setNum("paid_company_cash")} />
              </Field>
              <Field label="Company check">
                <MoneyInput value={moneyVal("paid_company_check")} onChange={setNum("paid_company_check")} />
              </Field>
              <Field label="Finance" wide>
                <MoneyInput value={moneyVal("paid_finance")} onChange={setNum("paid_finance")} />
              </Field>
            </div>
            <SubTotal label="Job total" value={preview.job_total} />
          </section>

          <Separator />

          {/* PARTS */}
          <section>
            <SectionTitle>Parts</SectionTitle>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Tech parts">
                <MoneyInput value={moneyVal("tech_parts")} onChange={setNum("tech_parts")} />
              </Field>
              <Field label="Company parts">
                <MoneyInput value={moneyVal("company_parts")} onChange={setNum("company_parts")} />
              </Field>
              <Field label="LM parts">
                <MoneyInput
                  value={moneyVal("lm_parts")}
                  onChange={setNum("lm_parts")}
                  title="Cost of parts the Location Manager supplied for this job."
                />
              </Field>
            </div>
          </section>

          <Separator />

          {/* LOCATION MANAGER COLLECTION */}
          <section>
            <SectionTitle>Location manager</SectionTitle>
            <p className="-mt-1 mb-2 text-[11px] leading-snug text-muted-foreground">
              Money the Location Manager personally collected from the customer for this job. Optional.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="LM cash">
                <MoneyInput
                  value={moneyVal("lm_cash")}
                  onChange={setNum("lm_cash")}
                  title="Cash the Location Manager collected from the customer for this job."
                />
              </Field>
              <Field label="LM check">
                <MoneyInput
                  value={moneyVal("lm_check")}
                  onChange={setNum("lm_check")}
                  title="Check the Location Manager received from the customer for this job."
                />
              </Field>
            </div>
          </section>

          <Separator />

          {/* TIPS */}
          <section>
            <SectionTitle>Tips</SectionTitle>
            <p className="-mt-1 mb-2 text-[11px] leading-snug text-muted-foreground">
              Tips only — do not include tip amounts in the payment fields above.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Tip card (-5%)">
                <MoneyInput value={moneyVal("tips_card")} onChange={setNum("tips_card")} />
              </Field>
              <Field label="Tip finance (-10%)">
                <MoneyInput value={moneyVal("tips_finance")} onChange={setNum("tips_finance")} />
              </Field>
              <Field label="Tip company cash">
                <MoneyInput value={moneyVal("tips_company_cash")} onChange={setNum("tips_company_cash")} />
              </Field>
              <Field label="Tip check">
                <MoneyInput value={moneyVal("tips_check")} onChange={setNum("tips_check")} />
              </Field>
            </div>
            <SubTotal label="Tips" value={preview.tips} />
          </section>

          <Separator />

          <Field label="Notes">
            <Textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} maxLength={2000} />
          </Field>

          {/* LIVE PREVIEW — locked formula */}
          <section className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.04] to-accent/[0.05] p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-success animate-pulse-soft" />
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-foreground/80">
                  Live preview
                </div>
              </div>
              <div className="rounded-full bg-card px-2 py-0.5 text-[10px] font-semibold text-muted-foreground ring-1 ring-border">
                Tech share {Math.round((form.commission_rate || 0) * 100)}%
              </div>
            </div>
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <Row label="Job total" v={preview.job_total} />
              <Row label="Payment fee" v={preview.payment_fee} />
              <Row label="Total profit" v={preview.total_profit} />
              <Row label="Tech payout" v={preview.tech_payout} bold />
              <Row label="Cash" v={preview.cash} />
              <Row label="Balance" v={preview.balance} money />
              <Row label="Tips" v={preview.tips} />
              <Row label="Balance + Tips" v={preview.balance_plus_tips} bold money />
            </div>
          </section>
        </div>

        <SheetFooter className="sticky bottom-0 z-20 flex flex-row gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur safe-bottom sm:rounded-b-2xl">
          {job && onDelete && (
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="text-destructive hover:bg-destructive/10"
              onClick={async () => { if (job?.id) { await onDelete(job.id); onOpenChange(false); } }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <Button variant="outline" size="lg" onClick={() => onOpenChange(false)} className="flex-1">Cancel</Button>
          <Button size="lg" onClick={submit} disabled={busy} className="flex-1">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save job"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("space-y-1", wide && "col-span-2")}>
      <Label className="text-[11px] font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function MoneyInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <Input inputMode="decimal" pattern="[0-9.]*" placeholder="0" className="num h-11 text-base" {...props} />;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  );
}

function SubTotal({ label, value }: { label: string; value: number }) {
  return (
    <div className="mt-2 flex items-center justify-between rounded-md bg-muted/50 px-2.5 py-1.5">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="font-display text-sm font-semibold tabular-nums">{fmtMoney(value)}</span>
    </div>
  );
}

function Row({ label, v, bold, money }: { label: string; v: number; bold?: boolean; money?: boolean }) {
  return (
    <>
      <div className="text-muted-foreground">{label}</div>
      <div className={cn("text-right tabular-nums", bold && "font-semibold", money && balanceClassTechFavor(v))}>
        {money ? fmtMoneyTechFavor(v) : fmtMoney(v)}
      </div>
    </>
  );
}
