import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Loader2, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  withCalculations,
  normalizeJob,
  jobInputSchema,
  DEFAULT_CARD_FEE_RATE,
  type JobInput,
  type PaymentType,
  type TipType,
} from "@/lib/finance";
import { fmtMoney, moneyClass } from "@/lib/format";
import { parseWhatsApp } from "@/lib/parseWhatsApp";
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
}

const empty: Partial<JobInput> & { job_date: string; customer_name: string; address: string; notes: string } = {
  job_date: "",
  customer_name: "",
  address: "",
  payment_type: "Card" as PaymentType,
  tip_type: "None" as TipType,
  total_job: 0,
  tech_cash: 0,
  company_cash: 0,
  card_amount: 0,
  cash_amount: 0,
  tip_amount: 0,
  card_tip_amount: 0,
  cash_tip_amount: 0,
  card_fee_rate: DEFAULT_CARD_FEE_RATE,
  my_parts: 0,
  company_parts: 0,
  notes: "",
};

export function JobSheet({ open, onOpenChange, reportId, job, onSave, onDelete, defaultDate, busy }: Props) {
  const [form, setForm] = useState<typeof empty>({ ...empty, job_date: defaultDate });
  const [whatsapp, setWhatsapp] = useState("");
  const [showPaste, setShowPaste] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (job) {
      setForm({
        job_date: job.job_date,
        customer_name: job.customer_name ?? "",
        address: job.address ?? "",
        payment_type: job.payment_type,
        tip_type: job.tip_type,
        total_job: Number(job.total_job),
        tech_cash: Number(job.tech_cash),
        company_cash: Number(job.company_cash),
        card_amount: Number(job.card_amount),
        cash_amount: Number(job.cash_amount),
        tip_amount: Number(job.tip_amount),
        card_tip_amount: Number(job.card_tip_amount),
        cash_tip_amount: Number(job.cash_tip_amount),
        card_fee_rate: Number(job.card_fee_rate),
        my_parts: Number(job.my_parts),
        company_parts: Number(job.company_parts),
        notes: job.notes ?? "",
      });
    } else {
      setForm({ ...empty, job_date: defaultDate });
    }
    setWhatsapp("");
    setShowPaste(false);
  }, [open, job, defaultDate]);

  // Auto-derive split-aware fields when payment_type / tip_type changes
  const normalized = useMemo(() => normalizeJob(form as Partial<JobInput>), [form]);
  const preview = useMemo(() => {
    try {
      return withCalculations(normalized as JobInput);
    } catch {
      return null;
    }
  }, [normalized]);

  const set = (k: keyof typeof form, v: unknown) => setForm((p) => ({ ...p, [k]: v }));
  // Track raw string entry per money field so the user can freely type decimals like "250.", ".5", etc.
  const [moneyText, setMoneyText] = useState<Record<string, string>>({});
  const setNum = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    // Allow digits, a single dot, and up to 2 decimals
    let v = e.target.value.replace(/[^0-9.]/g, "");
    const firstDot = v.indexOf(".");
    if (firstDot !== -1) {
      v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, "");
      const [intPart, decPart = ""] = v.split(".");
      v = intPart + "." + decPart.slice(0, 2);
    }
    setMoneyText((p) => ({ ...p, [k as string]: v }));
    const n = v === "" || v === "." ? 0 : Number(v);
    set(k, Number.isFinite(n) ? n : 0);
  };
  const moneyVal = (k: keyof typeof form): string => {
    const t = moneyText[k as string];
    if (t !== undefined) return t;
    const n = form[k] as unknown as number;
    return n === 0 || n === undefined ? "" : String(n);
  };

  const applyParse = () => {
    const guess = parseWhatsApp(whatsapp);
    setForm((p) => ({
      ...p,
      ...(guess.customer_name !== undefined && { customer_name: guess.customer_name ?? "" }),
      ...(guess.address !== undefined && { address: guess.address ?? "" }),
      ...(guess.payment_type && { payment_type: guess.payment_type }),
      ...(guess.tip_type && { tip_type: guess.tip_type }),
      ...(guess.total_job !== undefined && { total_job: guess.total_job }),
      ...(guess.tip_amount !== undefined && { tip_amount: guess.tip_amount }),
      ...(guess.my_parts !== undefined && { my_parts: guess.my_parts }),
      ...(guess.company_parts !== undefined && { company_parts: guess.company_parts }),
      ...(guess.tech_cash !== undefined && { tech_cash: guess.tech_cash }),
      notes: p.notes || (whatsapp.length > 200 ? "" : whatsapp),
    }));
    toast.success("Filled from paste — please verify");
    setShowPaste(false);
  };

  const submit = async () => {
    const candidate = normalizeJob(form as Partial<JobInput>);
    const parsed = jobInputSchema.safeParse({
      ...candidate,
      job_date: form.job_date,
      customer_name: form.customer_name || null,
      address: form.address || null,
      notes: form.notes || null,
    });
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      toast.error(first?.message ?? "Please review the values");
      return;
    }
    await onSave({
      id: job?.id,
      job_date: form.job_date,
      customer_name: form.customer_name || null,
      address: form.address || null,
      payment_type: candidate.payment_type!,
      tip_type: candidate.tip_type!,
      total_job: candidate.total_job ?? 0,
      tech_cash: candidate.tech_cash ?? 0,
      company_cash: candidate.company_cash ?? 0,
      card_amount: candidate.card_amount ?? 0,
      cash_amount: candidate.cash_amount ?? 0,
      tip_amount: candidate.tip_amount ?? 0,
      card_tip_amount: candidate.card_tip_amount ?? 0,
      cash_tip_amount: candidate.cash_tip_amount ?? 0,
      card_fee_rate: candidate.card_fee_rate ?? 0,
      my_parts: candidate.my_parts ?? 0,
      company_parts: candidate.company_parts ?? 0,
      notes: form.notes || null,
    });
    onOpenChange(false);
  };

  const isSplit = normalized.payment_type === "Split";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[92dvh] overflow-y-auto rounded-t-2xl p-0 sm:h-[88dvh] sm:max-w-2xl sm:rounded-t-2xl sm:left-1/2 sm:right-auto sm:-translate-x-1/2"
      >
        <SheetHeader className="sticky top-0 z-10 border-b bg-background/95 px-5 py-4 backdrop-blur safe-top">
          <SheetTitle className="font-display">{job ? "Edit job" : "Add job"}</SheetTitle>
          <SheetDescription>Backend recomputes all totals on save.</SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-5 py-5 pb-44">
          {/* Paste box */}
          <div>
            {!showPaste ? (
              <Button variant="outline" size="sm" onClick={() => setShowPaste(true)} className="gap-2">
                <Sparkles className="h-3.5 w-3.5" />
                Paste WhatsApp closing
              </Button>
            ) : (
              <div className="space-y-2 rounded-xl border bg-muted/40 p-3">
                <Label htmlFor="paste" className="text-xs">Paste, then tap Apply. Always verify the values.</Label>
                <Textarea id="paste" rows={4} value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={applyParse} disabled={!whatsapp.trim()}>Apply</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setShowPaste(false)}>Cancel</Button>
                </div>
              </div>
            )}
          </div>

          {/* Basics */}
          <section className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <Input type="date" value={form.job_date} onChange={(e) => set("job_date", e.target.value)} required />
            </Field>
            <Field label="Customer">
              <Input value={form.customer_name} onChange={(e) => set("customer_name", e.target.value)} maxLength={200} />
            </Field>
            <Field label="Address" wide>
              <Input value={form.address} onChange={(e) => set("address", e.target.value)} maxLength={500} />
            </Field>
          </section>

          <Separator />

          {/* Payment & totals */}
          <section className="space-y-3">
            <Field label="Payment type">
              <Select value={form.payment_type} onValueChange={(v) => set("payment_type", v as PaymentType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Card">Card</SelectItem>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Split">Split (Card + Cash)</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Total job">
                <MoneyInput value={form.total_job} onChange={setNum("total_job")} />
              </Field>
              <Field label="Card fee">
                <div className="flex h-11 items-center rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground">
                  {Math.round(DEFAULT_CARD_FEE_RATE * 100)}% (locked)
                </div>
              </Field>
            </div>

            {isSplit && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Card amount"><MoneyInput value={form.card_amount} onChange={setNum("card_amount")} /></Field>
                <Field label="Cash amount"><MoneyInput value={form.cash_amount} onChange={setNum("cash_amount")} /></Field>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Tech kept cash"><MoneyInput value={form.tech_cash} onChange={setNum("tech_cash")} /></Field>
              <Field label="Company cash deposited"><MoneyInput value={form.company_cash} onChange={setNum("company_cash")} /></Field>
            </div>
          </section>

          <Separator />

          {/* Tip */}
          <section className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tip type">
                <Select value={form.tip_type} onValueChange={(v) => set("tip_type", v as TipType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="None">None</SelectItem>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Card">Card</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Tip amount">
                <MoneyInput
                  value={form.tip_amount}
                  onChange={setNum("tip_amount")}
                  disabled={form.tip_type === "None"}
                />
              </Field>
            </div>
          </section>

          <Separator />

          {/* Parts */}
          <section className="grid grid-cols-2 gap-3">
            <Field label="My parts (reimbursed)"><MoneyInput value={form.my_parts} onChange={setNum("my_parts")} /></Field>
            <Field label="Company parts"><MoneyInput value={form.company_parts} onChange={setNum("company_parts")} /></Field>
          </section>

          <Field label="Notes">
            <Textarea rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} maxLength={2000} />
          </Field>

          {/* Live preview from local engine (display only) */}
          <section className="rounded-xl border bg-secondary/40 p-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Live preview · backend will recompute
            </div>
            <div className="grid grid-cols-2 gap-y-2 text-sm num">
              <Row label="Card fee (5%)" v={preview?.card_fee_amount} />
              <Row label="Job after fee" v={preview?.job_after_fee} />
              <Row label="Tip net" v={preview?.tip_net} />
              <Row label="Amount before parts" v={preview?.amount_before_parts} />
              <Row label="Base for split" v={preview?.base_for_split} />
              <Row label="Tech 30%" v={preview?.tech_30} />
              <Row label="Company 70%" v={preview?.company_70} />
              <Row label="Tech payout" v={preview?.tech_payout} bold />
              <Row label="Company total" v={preview?.company_total} />
              <Row label="Job balance" v={preview?.job_balance} bold money />
            </div>
            {preview && preview.base_for_split < 0 && (
              <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs text-destructive">
                ⚠ Base for split is negative — parts exceed the after-fee job amount.
              </div>
            )}
          </section>
        </div>

        <SheetFooter className="fixed inset-x-0 bottom-0 z-20 flex flex-row gap-2 border-t bg-background/95 px-5 py-3 backdrop-blur safe-bottom sm:absolute sm:rounded-b-2xl">
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
    <div className={cn("space-y-1.5", wide && "col-span-2")}>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function MoneyInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <Input inputMode="decimal" pattern="[0-9.]*" className="num h-11 text-base" {...props} />;
}

function Row({ label, v, bold, money }: { label: string; v: number | undefined; bold?: boolean; money?: boolean }) {
  return (
    <>
      <div className="text-muted-foreground">{label}</div>
      <div className={cn("text-right", bold && "font-semibold", money && moneyClass(v ?? 0))}>{fmtMoney(v ?? 0)}</div>
    </>
  );
}
