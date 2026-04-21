import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarIcon, Pencil, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { z } from "zod";

import { OfficeLayout } from "@/components/office/OfficeLayout";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type PaymentType = "Card" | "Cash" | "Split";

interface Technician {
  id: string;
  full_name: string;
  is_active: boolean;
}

interface OfficeJob {
  id: string;
  technician_id: string;
  job_date: string;
  customer_name: string | null;
  address: string | null;
  payment_type: PaymentType;
  total_job: number;
  tip_amount: number;
  my_parts: number;
  company_parts: number;
  tech_cash: number;
  company_cash: number;
  notes: string | null;
  is_deleted: boolean;
  weekly_report_id: string | null;
  created_at: string;
  technician?: { full_name: string } | null;
}

const jobSchema = z.object({
  technician_id: z.string().uuid("Select a technician"),
  job_date: z.string().min(1, "Date required"),
  customer_name: z.string().trim().max(120).optional().nullable(),
  address: z.string().trim().max(255).optional().nullable(),
  payment_type: z.enum(["Card", "Cash", "Split"]),
  total_job: z.number().min(0).max(1_000_000),
  tip_amount: z.number().min(0).max(1_000_000),
  my_parts: z.number().min(0).max(1_000_000),
  company_parts: z.number().min(0).max(1_000_000),
  tech_cash: z.number().min(0).max(1_000_000),
  company_cash: z.number().min(0).max(1_000_000),
  notes: z.string().trim().max(1000).optional().nullable(),
});

type JobFormValues = z.infer<typeof jobSchema>;

const EMPTY_FORM: JobFormValues = {
  technician_id: "",
  job_date: format(new Date(), "yyyy-MM-dd"),
  customer_name: "",
  address: "",
  payment_type: "Card",
  total_job: 0,
  tip_amount: 0,
  my_parts: 0,
  company_parts: 0,
  tech_cash: 0,
  company_cash: 0,
  notes: "",
};

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
  const [form, setForm] = useState<JobFormValues>(EMPTY_FORM);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data: technicians = [] } = useQuery({
    queryKey: ["office", "technicians"],
    queryFn: async (): Promise<Technician[]> => {
      const { data, error } = await supabase
        .from("users")
        .select("id, full_name, is_active")
        .eq("role", "technician")
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as Technician[];
    },
  });

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["office", "jobs", showDeleted],
    queryFn: async (): Promise<OfficeJob[]> => {
      let q = supabase
        .from("office_jobs")
        .select("*, technician:users!office_jobs_technician_id_fkey(full_name)")
        .order("job_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500);
      if (!showDeleted) q = q.eq("is_deleted", false);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as OfficeJob[];
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
      sales: active.reduce((s, j) => s + Number(j.total_job ?? 0), 0),
      tips: active.reduce((s, j) => s + Number(j.tip_amount ?? 0), 0),
    };
  }, [jobs]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (j: OfficeJob) => {
    setEditingId(j.id);
    setForm({
      technician_id: j.technician_id,
      job_date: j.job_date,
      customer_name: j.customer_name ?? "",
      address: j.address ?? "",
      payment_type: j.payment_type,
      total_job: Number(j.total_job ?? 0),
      tip_amount: Number(j.tip_amount ?? 0),
      my_parts: Number(j.my_parts ?? 0),
      company_parts: Number(j.company_parts ?? 0),
      tech_cash: Number(j.tech_cash ?? 0),
      company_cash: Number(j.company_cash ?? 0),
      notes: j.notes ?? "",
    });
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async (values: JobFormValues) => {
      const parsed = jobSchema.parse(values);
      const payload = {
        technician_id: parsed.technician_id,
        job_date: parsed.job_date,
        customer_name: parsed.customer_name || null,
        address: parsed.address || null,
        payment_type: parsed.payment_type,
        total_job: parsed.total_job,
        tip_amount: parsed.tip_amount,
        my_parts: parsed.my_parts,
        company_parts: parsed.company_parts,
        tech_cash: parsed.tech_cash,
        company_cash: parsed.company_cash,
        notes: parsed.notes || null,
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
      description="Manually entered jobs from the office side"
      actions={
        <Button size="sm" onClick={openCreate} className="gap-1.5">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New job</span>
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatTile label="Active entries" value={totals.count.toString()} />
        <StatTile label="Total sales" value={fmtMoney(totals.sales)} />
        <StatTile label="Total tips" value={fmtMoney(totals.tips)} />
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
              <SelectItem key={t.id} value={t.id}>
                {t.full_name}
              </SelectItem>
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

      <div className="rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Technician</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Tip</TableHead>
              <TableHead className="text-right">Parts (mine/co.)</TableHead>
              <TableHead className="w-[1%]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                  No office jobs yet. Click <strong>New job</strong> to add one.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((j) => (
                <TableRow key={j.id} className={j.is_deleted ? "opacity-60" : ""}>
                  <TableCell className="whitespace-nowrap font-medium tabular-nums">
                    {format(new Date(j.job_date + "T00:00:00"), "MMM d")}
                    {j.is_deleted && (
                      <Badge variant="outline" className="ml-2 text-[10px] uppercase">
                        Deleted
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{j.technician?.full_name ?? "—"}</TableCell>
                  <TableCell>
                    <div className="font-medium">{j.customer_name || "—"}</div>
                    {j.address && (
                      <div className="text-xs text-muted-foreground">{j.address}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-normal">
                      {j.payment_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(j.total_job)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(j.tip_amount)}</TableCell>
                  <TableCell className="text-right tabular-nums text-xs">
                    {fmtMoney(j.my_parts)} / {fmtMoney(j.company_parts)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {j.is_deleted ? (
                      isManagement && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => restoreMutation.mutate(j.id)}
                          aria-label="Restore"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )
                    ) : (
                      <div className="flex items-center gap-0.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openEdit(j)}
                          aria-label="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setConfirmDeleteId(j.id)}
                          aria-label="Delete"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

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
              The entry will be marked as deleted. Management can still view and restore it for
              audit.
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
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="num mt-1.5 font-display text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function JobDialog({
  open,
  onOpenChange,
  editing,
  form,
  setForm,
  technicians,
  onSubmit,
  saving,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  editing: boolean;
  form: JobFormValues;
  setForm: (f: JobFormValues) => void;
  technicians: Technician[];
  onSubmit: () => void;
  saving: boolean;
}) {
  const update = <K extends keyof JobFormValues>(k: K, v: JobFormValues[K]) =>
    setForm({ ...form, [k]: v });

  useEffect(() => {
    if (form.payment_type === "Card") {
    }
  }, [form.payment_type]);

  const dateObj = form.job_date ? new Date(form.job_date + "T00:00:00") : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit office job" : "New office job"}</DialogTitle>
          <DialogDescription>
            Manually entered for verification. Does not affect technician balances.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Technician">
              <Select
                value={form.technician_id}
                onValueChange={(v) => update("technician_id", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select technician" />
                </SelectTrigger>
                <SelectContent>
                  {technicians.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.full_name}
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
                    onSelect={(d) =>
                      d && update("job_date", format(d, "yyyy-MM-dd"))
                    }
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </Field>

            <Field label="Customer name">
              <Input
                value={form.customer_name ?? ""}
                onChange={(e) => update("customer_name", e.target.value)}
                maxLength={120}
              />
            </Field>

            <Field label="Payment type">
              <Select
                value={form.payment_type}
                onValueChange={(v) => update("payment_type", v as PaymentType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Card">Card</SelectItem>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Split">Split</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field label="Address" full>
              <Input
                value={form.address ?? ""}
                onChange={(e) => update("address", e.target.value)}
                maxLength={255}
              />
            </Field>

            <Field label="Total job">
              <NumberInput
                value={form.total_job}
                onChange={(v) => update("total_job", v)}
              />
            </Field>
            <Field label="Tip">
              <NumberInput value={form.tip_amount} onChange={(v) => update("tip_amount", v)} />
            </Field>

            <Field label="My parts">
              <NumberInput value={form.my_parts} onChange={(v) => update("my_parts", v)} />
            </Field>
            <Field label="Company parts">
              <NumberInput
                value={form.company_parts}
                onChange={(v) => update("company_parts", v)}
              />
            </Field>

            <Field label="Tech cash">
              <NumberInput value={form.tech_cash} onChange={(v) => update("tech_cash", v)} />
            </Field>
            <Field label="Company cash">
              <NumberInput
                value={form.company_cash}
                onChange={(v) => update("company_cash", v)}
              />
            </Field>

            <Field label="Notes" full>
              <Textarea
                value={form.notes ?? ""}
                onChange={(e) => update("notes", e.target.value)}
                maxLength={1000}
                rows={3}
              />
            </Field>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !form.technician_id}>
              {saving ? "Saving…" : editing ? "Save changes" : "Create job"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={cn("space-y-1.5", full && "sm:col-span-2")}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function NumberInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
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
    />
  );
}
