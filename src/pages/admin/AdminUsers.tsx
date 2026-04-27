import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Loader2, Search, ShieldCheck, Trash2, Wrench, KeyRound, UserCheck, Clock } from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { fmtPct } from "@/lib/format";
import { MultiAreaSelect } from "@/components/MultiAreaSelect";
import { useAllUserAreas, useSetUserAreas } from "@/hooks/useUserAreas";

type Role = Database["public"]["Enums"]["app_role"];
interface UserRow {
  id: string; full_name: string; email: string; phone: string | null;
  role: Role; area_id: string | null; area_manager_id: string | null; is_active: boolean;
  commission_rate: number;
  archived_at: string | null;
  pending_approval: boolean;
}

export default function AdminUsers() {
  const qc = useQueryClient();
  const { profile, user } = useAuth();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | Role>("all");
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "deleted" | "all">("active");

  const { data: users, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, full_name, email, phone, role, area_id, area_manager_id, is_active, commission_rate, archived_at, pending_approval")
        .order("full_name");
      if (error) throw error;
      return data as UserRow[];
    },
  });

  const { data: areas } = useQuery({
    queryKey: ["areas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("areas").select("id, name").order("name");
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
  });

  const { data: userAreas } = useAllUserAreas();
  const setUserAreas = useSetUserAreas();

  const updateUser = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<UserRow> }) => {
      const { error } = await supabase.from("users").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["technicians"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Update failed"),
  });

  const deleteUser = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke("delete-user", {
        body: { user_id: id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { ok: true; mode: "soft" | "hard" };
    },
    onSuccess: (data) => {
      toast.success(
        data?.mode === "soft"
          ? "User access removed. Historical records preserved."
          : "User deleted.",
      );
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["technicians"] });
      qc.invalidateQueries({ queryKey: ["all-user-areas"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Delete failed"),
  });

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    return (users ?? []).filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (statusFilter === "active" && (!u.is_active || u.archived_at)) return false;
      if (statusFilter === "inactive" && (u.is_active || u.archived_at)) return false;
      if (statusFilter === "deleted" && !u.archived_at) return false;
      if (!term) return true;
      return (
        u.full_name.toLowerCase().includes(term) ||
        u.email.toLowerCase().includes(term) ||
        (u.phone ?? "").toLowerCase().includes(term)
      );
    });
  }, [users, search, roleFilter, statusFilter]);

  

  if (profile?.role !== "management") return null;

  return (
    <AdminLayout title="Users & roles" description="Manage technicians, area managers, and management">
      <div className="space-y-4">
        <Card>
          <CardContent className="grid grid-cols-1 gap-3 p-4 md:grid-cols-4">
            <div className="relative md:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name, email or phone"
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as any)}>
              <SelectTrigger><SelectValue placeholder="Role" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                <SelectItem value="technician">Technicians</SelectItem>
                <SelectItem value="area_manager">Area managers</SelectItem>
                <SelectItem value="office_staff">Office Staff</SelectItem>
                <SelectItem value="management">Management</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active only</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="deleted">Deleted</SelectItem>
                <SelectItem value="all">All statuses</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <p className="px-1 text-xs text-muted-foreground">
          New users are created when they sign up at the login page. Once they appear here, you can promote them to management or assign them to a location.
        </p>

        {isLoading ? (
          <div className="flex justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center text-sm text-muted-foreground">
              No users match these filters.
            </CardContent>
          </Card>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <ul className="divide-y">
              {filtered.map((u) => {
                const isMe = u.id === user?.id;
                const areaManagers = (users ?? []).filter((x) => x.role === "area_manager" && x.is_active);
                const myAreas = (userAreas ?? []).filter((ua) => ua.user_id === u.id);
                const myAreaIds = myAreas.map((ua) => ua.area_id);
                const myPrimaryId = myAreas.find((ua) => ua.is_primary)?.area_id ?? u.area_id ?? null;
                const myAreaNames = myAreaIds
                  .map((id) => areas?.find((a) => a.id === id)?.name)
                  .filter(Boolean) as string[];
                return (
                  <li key={u.id} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{u.full_name}</span>
                          {u.role === "management" ? (
                            <Badge variant="secondary" className="gap-1">
                              <ShieldCheck className="h-3 w-3" /> Management
                            </Badge>
                          ) : u.role === "area_manager" ? (
                            <Badge variant="secondary" className="gap-1">
                              <ShieldCheck className="h-3 w-3" /> Area Manager
                            </Badge>
                          ) : u.role === "office_staff" ? (
                            <Badge variant="secondary" className="gap-1">
                              <ShieldCheck className="h-3 w-3" /> Office Staff
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1">
                              <Wrench className="h-3 w-3" /> Technician
                            </Badge>
                          )}
                          {u.archived_at ? (
                            <Badge variant="destructive">Deleted</Badge>
                          ) : !u.is_active ? (
                            <Badge variant="destructive">Inactive</Badge>
                          ) : null}
                          {isMe && <Badge>You</Badge>}
                        </div>
                        <div className="mt-1 truncate text-sm text-muted-foreground">{u.email}</div>
                        {u.phone && <div className="text-xs text-muted-foreground">{u.phone}</div>}
                        <div className="mt-1 text-xs text-muted-foreground">
                          Locations:{" "}
                          <span className="font-medium text-foreground">
                            {myAreaNames.length === 0 ? "Unassigned" : myAreaNames.join(", ")}
                          </span>
                        </div>
                        {u.role === "technician" && (
                          <>
                            <div className="text-xs text-muted-foreground">
                              Area manager:{" "}
                              <span className="font-medium text-foreground">
                                {areaManagers.find((m) => m.id === u.area_manager_id)?.full_name ?? "Unassigned"}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Commission: <span className="font-medium text-foreground">{fmtPct(u.commission_rate)}</span>
                            </div>
                          </>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-xs text-muted-foreground">Active</span>
                          <Switch
                            checked={u.is_active}
                            disabled={isMe || updateUser.isPending || !!u.archived_at}
                            onCheckedChange={(v) => updateUser.mutate({ id: u.id, patch: { is_active: v } })}
                          />
                        </div>
                        {!u.archived_at && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 gap-1.5 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                disabled={isMe || deleteUser.isPending}
                                aria-label={`Delete ${u.full_name}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span className="text-xs">Delete</span>
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will remove access for <span className="font-medium text-foreground">{u.full_name}</span>.
                                  Their login will be revoked immediately and they will no longer
                                  appear in active user lists or assignment dropdowns.
                                  <br /><br />
                                  If they have historical reports, jobs, or payments, those records
                                  are preserved and the user is marked as <span className="font-medium">Deleted</span> for
                                  archival reference. Otherwise the account is fully removed.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() => deleteUser.mutate(u.id)}
                                >
                                  Remove access
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </div>

                    {!u.archived_at && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">Role</label>
                        <Select
                          value={u.role}
                          onValueChange={(v) => {
                            // When demoting away from technician, clear area_manager_id to satisfy trigger
                            const patch: Partial<UserRow> = { role: v as Role };
                            if (v !== "technician") patch.area_manager_id = null;
                            updateUser.mutate({ id: u.id, patch }, {
                              onSuccess: () => toast.success(`Role set to ${v}`),
                            });
                          }}
                          disabled={isMe || updateUser.isPending}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="technician">Technician</SelectItem>
                            <SelectItem value="area_manager">Area Manager</SelectItem>
                            <SelectItem value="office_staff">Office Staff</SelectItem>
                            <SelectItem value="management">Management</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">
                          Locations {myAreaIds.length > 1 && <span className="text-foreground">({myAreaIds.length})</span>}
                        </label>
                        <MultiAreaSelect
                          areas={areas ?? []}
                          value={myAreaIds}
                          primaryId={myPrimaryId}
                          disabled={setUserAreas.isPending}
                          onChange={({ areaIds, primaryId }) => {
                            setUserAreas.mutate(
                              { userId: u.id, areaIds, primaryId },
                              {
                                onSuccess: () => toast.success("Locations updated"),
                                onError: (e: any) => toast.error(e?.message ?? "Update failed"),
                              },
                            );
                          }}
                        />
                      </div>
                      {u.role === "technician" && (
                        <div>
                          <label className="mb-1 block text-xs font-medium text-muted-foreground">Area manager</label>
                          <Select
                            value={u.area_manager_id ?? "none"}
                            onValueChange={(v) =>
                              updateUser.mutate(
                                { id: u.id, patch: { area_manager_id: v === "none" ? null : v } },
                                { onSuccess: () => toast.success("Area manager updated") },
                              )
                            }
                            disabled={updateUser.isPending || areaManagers.length === 0}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={areaManagers.length === 0 ? "No area managers yet" : "Unassigned"} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Unassigned</SelectItem>
                              {areaManagers.map((m) => (
                                <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      {u.role === "technician" && (
                        <div>
                          <label className="mb-1 block text-xs font-medium text-muted-foreground">Commission</label>
                          <CommissionInput
                            valueDecimal={Number(u.commission_rate ?? 0.3)}
                            disabled={updateUser.isPending}
                            onCommit={(decimal) =>
                              updateUser.mutate(
                                { id: u.id, patch: { commission_rate: decimal } as any },
                                { onSuccess: () => toast.success(`Commission set to ${fmtPct(decimal)}`) },
                              )
                            }
                          />
                        </div>
                      )}
                    </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

/**
 * Edits a technician commission rate. The user types a percentage (e.g. 30 or 27.5);
 * the value is stored as a decimal (0.30, 0.275). Clamped to 0–100%.
 */
function CommissionInput({
  valueDecimal,
  disabled,
  onCommit,
}: {
  valueDecimal: number;
  disabled?: boolean;
  onCommit: (decimal: number) => void;
}) {
  const initial = (valueDecimal * 100).toFixed(2).replace(/\.?0+$/, "");
  const [text, setText] = useState(initial);

  // Resync when parent value changes (e.g. after successful save)
  const lastSyncedRef = (CommissionInput as any)._ref || ((CommissionInput as any)._ref = { current: new WeakMap() });
  if (lastSyncedRef.current.get(onCommit) !== valueDecimal) {
    lastSyncedRef.current.set(onCommit, valueDecimal);
  }

  const commit = () => {
    const cleaned = text.trim();
    const pct = parseFloat(cleaned);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      setText(initial);
      toast.error("Commission must be between 0 and 100");
      return;
    }
    const decimal = Math.round(pct * 100) / 10000; // 2dp percent → 4dp decimal
    if (Math.abs(decimal - valueDecimal) < 0.00001) {
      setText((decimal * 100).toFixed(2).replace(/\.?0+$/, ""));
      return;
    }
    onCommit(decimal);
  };

  return (
    <div className="relative">
      <Input
        inputMode="decimal"
        value={text}
        disabled={disabled}
        onChange={(e) => {
          const v = e.target.value.replace(/[^0-9.]/g, "");
          const parts = v.split(".");
          const clean = parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : v;
          const limited = clean.includes(".") ? clean.slice(0, clean.indexOf(".") + 3) : clean;
          setText(limited);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="pr-8"
        aria-label="Commission percent"
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
    </div>
  );
}
