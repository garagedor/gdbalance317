/**
 * Office Jobs — manual entry of jobs by office_staff (and management).
 * Uses the new Phase-4 input model and the shared JobsTable. Same locked
 * engine as the technician flow.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarIcon, Plus, Search } from "lucide-react";

import { OfficeLayout } from "@/components/office/OfficeLayout";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { fmtMoney, fmtPct, moneyClass } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  computeNewJob,
  derivePayMethod,
  DEFAULT_COMMISSION_RATE,
  type NewJobInput,
} from "@/lib/finance";
import { JobsTable, type JobsTableRow } from "@/components/JobsTable";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface Technician {
  id: string;
  full_name: string;
  is_active: boolean;
  commission_rate: number;
}

interface OfficeJobRow {
  id: string;
  technician_id: string;
  job_date: string;
  customer_name: string | null;
  address: string | null;
  notes: string | null;
  is_deleted: boolean;
  weekly_report_id: string | null;
  reconciliation_status: string | null;
  // new model
  tech_paid_cash: number;
  paid_card: number;
  paid_company_cash: number;
  paid_company_check: number;
  paid_finance: number;
  tech_parts: number;
  company_parts: number;
  tips_card: number;
  tips_finance: number;
  tips_company_cash: number;
  tips_check: number;
  commission_rate: number;
  // engine outputs
  job_total: number;
  payment_fee: number;
  total_profit: number;
  tech_payout_new: number;
  cash: number;
  balance: number;
  tips_total: number;
  balance_plus_tips: number;
  technician?: { full_name: string } | null;
}

type Form = NewJobInput & {
  technician_id: string;
  job_date: string;
  customer_name: string;
  address: string;
  notes: string;
};

const emptyForm = (): Form => ({
  technician_id: "",
  job_date: format(new Date(), "yyyy-MM-dd"),
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
  commission_rate: DEFAULT_COMMISSION_RATE,
});

export default function OfficeJobs() {
  const { profile } = useAuth();
  const isManagement = profile?.role === "management";
  const Layout = isManagement ? AdminLayout : OfficeLayout;

  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [techFilter, setTechFilter] = useState<string>("all");
  const [showDeleted, setShowDeleted] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(emptyForm());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data: technicians = [] } = useQuery({
    queryKey: ["office", "technicians"],
    queryFn: async (): Promise<Technician[]> => {
      const { data, error } = await supabase
        .from("users")
        .select("id, full_name, is_active, commission_rate")
        .eq("role", "technician")
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as Technician[];
    },
  });

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["office", "jobs", showDeleted],
    queryFn: async (): Promise<OfficeJobRow[]> => {
      let q = supabase
        .from("office_jobs")
        .select("*, technician:users!office_jobs_technician_id_fkey(full_name)")
        .order("job_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500);
      if (!showDeleted) q = q.eq("is_deleted", false);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as OfficeJobRow[];
    },
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return jobs.filter((j) => {
      if (techFilter !== "all" && j.technician_id !== techFilter) return false;
      if (!term) return true;
      return (
        j.customer_name?.toLowerCase().includes(term) ||
        j.address?.toLowerCase().includes(term) ||
        j.technician?.full_name?.toLowerCase().includes(term) ||
        j.notes?.toLowerCase().includes(term)
      );
    });
  }, [jobs, search, techFilter]);

  const totals = useMemo(() => {
    const active = jobs.filter((j) => !j.is_deleted);
    return {
      count: active.length,
      sales: active.reduce((s, j) => s + Number(j.job_total ?? 0), 0),
      tips: active.reduce((s, j) => s + Number(j.tips_total ?? 0), 0),
      techPayout: active.reduce((s, j) => s + Number(j.tech_payout_new ?? 0), 0),
    };
  }, [jobs]);

  const tableRows: JobsTableRow[] = useMemo(
    () =>
      filtered.map((j) => ({
        id: j.id,
        job_date: j.job_date,
        address: j.address,
        customer_name: j.customer_name,
        technician_name: j.technician?.full_name ?? "—",
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
        reconciliation_status: j.reconciliation_status,
        is_deleted: j.is_deleted,
      })),
    [filtered],
  );

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (id: string) => {
    const j = jobs.find((x) => x.id === id);
    if (!j) return;
    setEditingId(j.id);
    setForm({
      technician_id: j.technician_id,
      job_date: j.job_date,
      customer_name: j.customer_name ?? "",
      address: j.address ?? "",
      notes: j.notes ?? "",
      tech_paid_cash: Number(j.tech_paid_cash ?? 0),
      paid_card: Number(j.paid_card ?? 0),
      paid_company_cash: Number(j.paid_company_cash ?? 0),
      paid_company_check: Number(j.paid_company_check ?? 0),
      paid_finance: Number(j.paid_finance ?? 0),
      tech_parts: Number(j.tech_parts ?? 0),
      company_parts: Number(j.company_parts ?? 0),
      tips_card: Number(j.tips_card ?? 0),
      tips_finance: Number(j.tips_finance ?? 0),
      tips_company_cash: Number(j.tips_company_cash ?? 0),
      tips_check: Number(j.tips_check ?? 0),
      commission_rate: Number(j.commission_rate ?? DEFAULT_COMMISSION_RATE),
    });
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async (values: Form) => {
      if (!values.technician_id) throw new Error("Select a technician");
      const preview = computeNewJob(values);
      if (preview.job_total <= 0) throw new Error("Enter at least one payment amount");
      const payload = {
        technician_id: values.technician_id,
        job_date: values.job_date,
        customer_name: values.customer_name || null,
        address: values.address || null,
        notes: values.notes || null,
        // new model
        tech_paid_cash: values.tech_paid_cash,
        paid_card: values.paid_card,
        paid_company_cash: values.paid_company_cash,
        paid_company_check: values.paid_company_check,
        paid_finance: values.paid_finance,
        tech_parts: values.tech_parts,
        company_parts: values.company_parts,
        tips_card: values.tips_card,
        tips_finance: values.tips_finance,
        tips_company_cash: values.tips_company_cash,
        tips_check: values.tips_check,
        commission_rate: values.commission_rate,
        // satisfy NOT NULL legacy columns; trigger overwrites them
        payment_type: "Card" as const,
        tip_type: "None" as const,
        total_job: preview.job_total,
        card_amount: values.paid_card,
        cash_amount: values.tech_paid_cash,
        tip_amount: 0,
        card_tip_amount: values.tips_card + values.tips_finance,
        cash_tip_amount: values.tips_company_cash + values.tips_check,
        my_parts: values.tech_parts,
        tech_cash: values.tech_paid_cash,
        company_cash: values.paid_company_cash,
        card_fee_rate: 0.05,
      };
      if (editingId) {
        const { error } = await supabase
          .from("office_jobs")
          .update({ ...payload, updated_by_user_id: profile!.id })
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("office_jobs").insert({
          ...payload,
          created_by_user_id: profile!.id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["office", "jobs"] });
      setDialogOpen(false);
      toast.success(editingId ? "Job updated" : "Job created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("office_jobs")
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by_user_id: profile!.id,
          updated_by_user_id: profile!.id,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["office", "jobs"] });
      setConfirmDeleteId(null);
      toast.success("Job deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("office_jobs")
        .update({
          is_deleted: false,
          deleted_at: null,
          deleted_by_user_id: null,
          updated_by_user_id: profile!.id,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["office", "jobs"] });
      toast.success("Job restored");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Layout
      title="Office Jobs"
      description="Manually entered jobs — calculated by the same locked engine as technician reports"
      actions={
        <Button size="sm" onClick={openCreate} className="gap-1.5">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New job</span>
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Active entries" value={totals.count.toString()} />
        <StatTile label="Total sales" value={fmtMoney(totals.sales)} />
        <StatTile label="Total tips" value={fmtMoney(totals.tips)} />
        <StatTile label="Tech payout" value={fmtMoney(totals.techPayout)} />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer, address, technician, notes…"
            className="pl-9"
          />
        </div>
        <Select value={techFilter} onValueChange={setTechFilter}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder="All technicians" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All technicians</SelectItem>
            {technicians.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isManagement && (
          <Button
            variant={showDeleted ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowDeleted((s) => !s)}
          >
            {showDeleted ? "Hiding" : "Show"} deleted
          </Button>
        )}
      </div>

      <JobsTable
        rows={tableRows}
        loading={isLoading}
        showTechnician
        onEdit={openEdit}
        onDelete={(id) => setConfirmDeleteId(id)}
        onRestore={(id) => restoreMutation.mutate(id)}
        emptyHint={<>No office jobs yet. Click <strong>New job</strong> to add one.</>}
      />

      <JobDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={!!editingId}
        form={form}
        setForm={setForm}
        technicians={technicians}
        onSubmit={() => saveMutation.mutate(form)}
        saving={saveMutation.isPending}
      />

      <AlertDialog open={!!confirmDeleteId} onOpenChange={(o) => !o && setConfirmDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this office job?</AlertDialogTitle>
            <AlertDialogDescription>
              The entry will be marked as deleted. Management can still view and restore it for audit.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmDeleteId && deleteMutation.mutate(confirmDeleteId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="num mt-1.5 font-display text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

/* ─── Dialog ────────────────────────────────────────────────────────── */

function JobDialog({
  open, onOpenChange, editing, form, setForm, technicians, onSubmit, saving,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  editing: boolean;
  form: Form;
  setForm: (f: Form) => void;
  technicians: Technician[];
  onSubmit: () => void;
  saving: boolean;
}) {
  const update = <K extends keyof Form>(k: K, v: Form[K]) => setForm({ ...form, [k]: v });

  // Snapshot commission_rate from selected technician
  useEffect(() => {
    if (!form.technician_id) return;
    const t = technicians.find((x) => x.id === form.technician_id);
    if (t && t.commission_rate !== form.commission_rate) {
      setForm({ ...form, commission_rate: t.commission_rate });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.technician_id, technicians]);

  const preview = useMemo(() => computeNewJob(form), [form]);
  const payMethod = useMemo(() => derivePayMethod(form), [form]);
  const dateObj = form.job_date ? new Date(form.job_date + "T00:00:00") : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit office job" : "New office job"}</DialogTitle>
          <DialogDescription>
            {payMethod !== "—" ? `${payMethod} · ` : ""}Same locked engine as technician reports.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
          className="space-y-4"
        >
          {/* Header fields */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Technician">
              <Select value={form.technician_id} onValueChange={(v) => update("technician_id", v)}>
                <SelectTrigger><SelectValue placeholder="Select technician" /></SelectTrigger>
                <SelectContent>
                  {technicians.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.full_name} · {fmtPct(t.commission_rate)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Date">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !dateObj && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateObj ? format(dateObj, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateObj}
                    onSelect={(d) => d && update("job_date", format(d, "yyyy-MM-dd"))}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </Field>

            <Field label="Customer name">
              <Input
                value={form.customer_name}
                onChange={(e) => update("customer_name", e.target.value)}
                maxLength={120}
              />
            </Field>
            <Field label="Address">
              <Input
                value={form.address}
                onChange={(e) => update("address", e.target.value)}
                maxLength={255}
              />
            </Field>
          </div>

          {/* PAYMENTS */}
          <Section title="Payments" subtotal={preview.job_total} subtotalLabel="Job total">
            <Money label="Tech cash" value={form.tech_paid_cash} onChange={(v) => update("tech_paid_cash", v)} />
            <Money label="Card" value={form.paid_card} onChange={(v) => update("paid_card", v)} />
            <Money label="Company cash" value={form.paid_company_cash} onChange={(v) => update("paid_company_cash", v)} />
            <Money label="Company check" value={form.paid_company_check} onChange={(v) => update("paid_company_check", v)} />
            <Money label="Finance" value={form.paid_finance} onChange={(v) => update("paid_finance", v)} />
          </Section>

          {/* PARTS */}
          <Section title="Parts">
            <Money label="Tech parts" value={form.tech_parts} onChange={(v) => update("tech_parts", v)} />
            <Money label="Company parts" value={form.company_parts} onChange={(v) => update("company_parts", v)} />
          </Section>

          {/* TIPS */}
          <Section title="Tips" subtotal={preview.tips} subtotalLabel="Tips">
            <Money label="Tip card (-5%)" value={form.tips_card} onChange={(v) => update("tips_card", v)} />
            <Money label="Tip finance (-10%)" value={form.tips_finance} onChange={(v) => update("tips_finance", v)} />
            <Money label="Tip company cash" value={form.tips_company_cash} onChange={(v) => update("tips_company_cash", v)} />
            <Money label="Tip check" value={form.tips_check} onChange={(v) => update("tips_check", v)} />
          </Section>

          <Field label="Notes">
            <Textarea
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              maxLength={1000}
              rows={2}
            />
          </Field>

          {/* Live preview */}
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Engine preview
              </p>
              <span className="text-[10px] text-muted-foreground">
                Tech share {fmtPct(form.commission_rate)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-4">
              <Line label="Job total" value={preview.job_total} />
              <Line label="Payment fee" value={preview.payment_fee} />
              <Line label="Total profit" value={preview.total_profit} />
              <Line label="Tech payout" value={preview.tech_payout} bold />
              <Line label="Cash" value={preview.cash} />
              <Line label="Balance" value={preview.balance} colored />
              <Line label="Tips" value={preview.tips} />
              <Line label="Balance + Tips" value={preview.balance_plus_tips} bold colored />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving || !form.technician_id}>
              {saving ? "Saving…" : editing ? "Save changes" : "Create job"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function Section({
  title, subtotal, subtotalLabel, hint, children,
}: {
  title: string;
  subtotal?: number;
  subtotalLabel?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
        {subtotal !== undefined && (
          <p className="text-xs text-muted-foreground">
            {subtotalLabel}: <span className="font-semibold tabular-nums text-foreground">{fmtMoney(subtotal)}</span>
          </p>
        )}
      </div>
      {hint && (
        <p className="mb-2 text-[11px] leading-snug text-muted-foreground">{hint}</p>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{children}</div>
    </div>
  );
}

function Money({
  label, value, onChange,
}: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <Field label={label}>
      <Input
        type="number"
        inputMode="decimal"
        step="0.01"
        min={0}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          onChange(Number.isFinite(n) ? n : 0);
        }}
        className="h-10"
      />
    </Field>
  );
}

function Line({
  label, value, bold, colored,
}: { label: string; value: number; bold?: boolean; colored?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-dashed border-border/60 py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("tabular-nums", bold && "font-semibold", colored && moneyClass(value))}>
        {fmtMoney(value)}
      </span>
    </div>
  );
}
