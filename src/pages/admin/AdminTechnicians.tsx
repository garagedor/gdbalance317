import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout, StatCard } from "@/components/admin/AdminLayout";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { fmtMoney, fmtPct, resolveBalance } from "@/lib/format";
import {
  Award,
  DollarSign,
  Eye,
  Loader2,
  MoreHorizontal,
  Percent,
  Search,
  TrendingUp,
  UserCheck,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const statusStyles: Record<string, string> = {
  active: "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]",
  inactive: "bg-muted text-muted-foreground",
};

type TechRow = {
  id: string;
  name: string;
  commission: number;
  manager: string;
  manager_id: string | null;
  sales: number;
  balance: number;
  status: "active" | "inactive";
};

function useAdminTechnicians(weekFilter: string /* "all" | week_start ISO */) {
  return useQuery({
    queryKey: ["admin-technicians", weekFilter],
    queryFn: async (): Promise<TechRow[]> => {
      const { data: techs, error: techErr } = await supabase
        .from("users")
        .select("id, full_name, commission_rate, is_active, area_manager_id, role")
        .in("role", ["technician", "area_manager"])
        .order("full_name");
      if (techErr) throw techErr;
      const technicians = (techs ?? []).filter((t) => t.role === "technician");
      if (technicians.length === 0) return [];

      const managerIds = Array.from(
        new Set(technicians.map((t) => t.area_manager_id).filter(Boolean) as string[]),
      );
      let managerMap = new Map<string, string>();
      if (managerIds.length > 0) {
        const { data: mgrs } = await supabase
          .from("users")
          .select("id, full_name")
          .in("id", managerIds);
        managerMap = new Map((mgrs ?? []).map((m) => [m.id, m.full_name]));
      }

      const techIds = technicians.map((t) => t.id);
      let q = supabase
        .from("weekly_reports")
        .select("technician_id, total_sales, net_balance, balance_payment_status, week_start");
      if (weekFilter !== "all") q = q.eq("week_start", weekFilter);
      const { data: reports } = await q;

      const agg = new Map<string, { sales: number; balance: number }>();
      (reports ?? []).forEach((r) => {
        if (!techIds.includes(r.technician_id as string)) return;
        const cur = agg.get(r.technician_id as string) ?? { sales: 0, balance: 0 };
        cur.sales += Number(r.total_sales) || 0;
        if (r.balance_payment_status !== "settled") {
          cur.balance += Number(r.net_balance) || 0;
        }
        agg.set(r.technician_id as string, cur);
      });

      return technicians.map((t) => {
        const a = agg.get(t.id) ?? { sales: 0, balance: 0 };
        return {
          id: t.id,
          name: t.full_name,
          commission: Number(t.commission_rate) || 0,
          manager: t.area_manager_id ? managerMap.get(t.area_manager_id) ?? "—" : "—",
          manager_id: t.area_manager_id ?? null,
          sales: a.sales,
          balance: a.balance,
          status: t.is_active ? "active" : "inactive",
        };
      });
    },
  });
}

function useAvailableWeeks() {
  return useQuery({
    queryKey: ["admin-tech-weeks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekly_reports")
        .select("week_start")
        .order("week_start", { ascending: false });
      if (error) throw error;
      const seen = new Set<string>();
      const weeks: string[] = [];
      (data ?? []).forEach((r) => {
        const w = r.week_start as string;
        if (w && !seen.has(w)) {
          seen.add(w);
          weeks.push(w);
        }
      });
      return weeks;
    },
  });
}

function useAreaManagers() {
  return useQuery({
    queryKey: ["area-managers-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, full_name")
        .eq("role", "area_manager")
        .eq("is_active", true)
        .is("archived_at", null)
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export default function AdminTechnicians() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const { data: techs, isLoading } = useAdminTechnicians();
  const { data: managers } = useAreaManagers();

  const [editTech, setEditTech] = useState<TechRow | null>(null);
  const [editPct, setEditPct] = useState("");
  const [savingPct, setSavingPct] = useState(false);

  const [reassignTech, setReassignTech] = useState<TechRow | null>(null);
  const [reassignMgr, setReassignMgr] = useState<string>("none");
  const [savingMgr, setSavingMgr] = useState(false);

  const rows = techs ?? [];
  const filtered = useMemo(
    () =>
      rows.filter(
        (t) =>
          t.name.toLowerCase().includes(search.toLowerCase()) ||
          t.manager.toLowerCase().includes(search.toLowerCase()),
      ),
    [rows, search],
  );

  const active = rows.filter((t) => t.status === "active").length;
  const totalBalance = rows.reduce((s, t) => s + t.balance, 0);
  const totalSales = rows.reduce((s, t) => s + t.sales, 0);
  const avgRevenue = active > 0 ? totalSales / active : 0;
  const top = rows.length > 0 ? [...rows].sort((a, b) => b.sales - a.sales)[0] : null;

  const isEmpty = !isLoading && rows.length === 0;

  const openEdit = (t: TechRow) => {
    setEditTech(t);
    setEditPct(String(Math.round(t.commission * 10000) / 100));
  };

  const saveCommission = async () => {
    if (!editTech) return;
    const pct = Number(editPct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      toast.error("Enter a percentage between 0 and 100");
      return;
    }
    setSavingPct(true);
    try {
      const { error } = await supabase
        .from("users")
        .update({ commission_rate: pct / 100 })
        .eq("id", editTech.id);
      if (error) throw error;
      toast.success("Commission updated");
      setEditTech(null);
      await qc.invalidateQueries({ queryKey: ["admin-technicians"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update commission");
    } finally {
      setSavingPct(false);
    }
  };

  const openReassign = (t: TechRow) => {
    setReassignTech(t);
    setReassignMgr(t.manager_id ?? "none");
  };

  const saveReassign = async () => {
    if (!reassignTech) return;
    setSavingMgr(true);
    try {
      const { error } = await supabase
        .from("users")
        .update({ area_manager_id: reassignMgr === "none" ? null : reassignMgr })
        .eq("id", reassignTech.id);
      if (error) throw error;
      toast.success("Area manager updated");
      setReassignTech(null);
      await qc.invalidateQueries({ queryKey: ["admin-technicians"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reassign");
    } finally {
      setSavingMgr(false);
    }
  };

  return (
    <AdminLayout
      title="Technicians"
      description="Manage technicians, commission rates, and assignments"
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Active Technicians"
          value={String(active)}
          hint={`${rows.length} total`}
          icon={UserCheck}
        />
        <StatCard
          label="Weekly Balances"
          value={fmtMoney(totalBalance)}
          hint="Open across all techs"
          icon={DollarSign}
        />
        <StatCard
          label="Top Performer"
          value={top ? top.name.split(" ")[0] : "—"}
          hint={top ? fmtMoney(top.sales) : "No data yet"}
          icon={Award}
        />
        <StatCard
          label="Avg Revenue / Tech"
          value={fmtMoney(avgRevenue)}
          hint="This week"
          icon={TrendingUp}
        />
      </div>

      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-muted-foreground" />
            <h2 className="font-display text-base font-semibold">All Technicians</h2>
          </div>
          <div className="relative w-full md:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search technicians..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              disabled={isEmpty}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading technicians…
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <Users className="h-8 w-8 text-muted-foreground" />
            <h3 className="font-display text-lg font-semibold">No technicians yet</h3>
            <p className="max-w-sm text-sm text-muted-foreground">
              Add your first technician to start tracking weekly balances.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Commission</TableHead>
                <TableHead>Area Manager</TableHead>
                <TableHead className="text-right">Week Sales</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium tabular-nums">
                      <Percent className="h-3 w-3 text-muted-foreground" />
                      {fmtPct(t.commission).replace("%", "")}%
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{t.manager}</TableCell>
                  <TableCell className="num text-right tabular-nums">{fmtMoney(t.sales)}</TableCell>
                  {(() => {
                    const dir =
                      t.balance > 0.005
                        ? "company_owes_technician"
                        : t.balance < -0.005
                        ? "technician_owes_company"
                        : "settled";
                    const bal = resolveBalance(Math.abs(t.balance), dir);
                    const tone =
                      bal.tone === "pos"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : bal.tone === "neg"
                        ? "text-destructive"
                        : "text-muted-foreground";
                    const label =
                      bal.direction === "SETTLED"
                        ? `Settled: ${fmtMoney(0)}`
                        : `${bal.labelManager}: ${fmtMoney(bal.amount)}`;
                    return (
                      <TableCell className={cn("num text-right font-semibold tabular-nums", tone)}>
                        <div>{fmtMoney(bal.amount)}</div>
                        <div className="text-[10px] font-normal opacity-80">{label}</div>
                      </TableCell>
                    );
                  })()}
                  <TableCell>
                    <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize", statusStyles[t.status])}>
                      {t.status}
                    </span>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => openEdit(t)}>
                          <Percent className="mr-2 h-4 w-4" /> Edit %
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openReassign(t)}>
                          <Users className="mr-2 h-4 w-4" /> Reassign Manager
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => nav(`/admin/reports?tech=${t.id}&tab=verified`)}
                        >
                          <Eye className="mr-2 h-4 w-4" /> View Reports
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Edit commission dialog */}
      <Dialog open={!!editTech} onOpenChange={(o) => !o && setEditTech(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit commission %</DialogTitle>
            <DialogDescription>
              Sets the default commission for <strong>{editTech?.name}</strong>. Existing submitted/approved reports keep their snapshotted rate. Draft and Returned reports refresh automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="pct">New commission %</Label>
            <Input
              id="pct"
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={editPct}
              onChange={(e) => setEditPct(e.target.value)}
              placeholder="e.g. 30"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTech(null)} disabled={savingPct}>
              Cancel
            </Button>
            <Button onClick={saveCommission} disabled={savingPct || editPct === ""}>
              {savingPct ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reassign manager dialog */}
      <Dialog open={!!reassignTech} onOpenChange={(o) => !o && setReassignTech(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reassign area manager</DialogTitle>
            <DialogDescription>
              Choose the area manager for <strong>{reassignTech?.name}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Area manager</Label>
            <Select value={reassignMgr} onValueChange={setReassignMgr}>
              <SelectTrigger>
                <SelectValue placeholder="Select manager" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Unassigned —</SelectItem>
                {(managers ?? []).map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReassignTech(null)} disabled={savingMgr}>
              Cancel
            </Button>
            <Button onClick={saveReassign} disabled={savingMgr}>
              {savingMgr ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
