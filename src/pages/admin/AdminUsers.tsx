import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2, Search, ShieldCheck, Wrench } from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { fmtPct } from "@/lib/format";

type Role = Database["public"]["Enums"]["app_role"];
interface UserRow {
  id: string; full_name: string; email: string; phone: string | null;
  role: Role; area_id: string | null; area_manager_id: string | null; is_active: boolean;
  commission_rate: number;
}

export default function AdminUsers() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { profile, user } = useAuth();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | Role>("all");

  const { data: users, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, full_name, email, phone, role, area_id, area_manager_id, is_active, commission_rate")
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

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    return (users ?? []).filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (!term) return true;
      return (
        u.full_name.toLowerCase().includes(term) ||
        u.email.toLowerCase().includes(term) ||
        (u.phone ?? "").toLowerCase().includes(term)
      );
    });
  }, [users, search, roleFilter]);

  const areaName = (id: string | null) => areas?.find((a) => a.id === id)?.name ?? null;

  if (profile?.role !== "management") return null;

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b bg-card/60 backdrop-blur safe-top">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => nav("/admin")} aria-label="Back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <p className="text-xs text-muted-foreground">Management</p>
              <h1 className="font-display text-lg font-semibold leading-tight">Users & roles</h1>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => nav("/admin/areas")}>
            Manage locations
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl space-y-4 px-5 py-5">
        <Card>
          <CardContent className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
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
                <SelectItem value="management">Management</SelectItem>
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
                          ) : (
                            <Badge variant="outline" className="gap-1">
                              <Wrench className="h-3 w-3" /> Technician
                            </Badge>
                          )}
                          {!u.is_active && <Badge variant="destructive">Inactive</Badge>}
                          {isMe && <Badge>You</Badge>}
                        </div>
                        <div className="mt-1 truncate text-sm text-muted-foreground">{u.email}</div>
                        {u.phone && <div className="text-xs text-muted-foreground">{u.phone}</div>}
                        {u.role === "technician" && (
                          <>
                            <div className="mt-1 text-xs text-muted-foreground">
                              Location: <span className="font-medium text-foreground">{areaName(u.area_id) ?? "Unassigned"}</span>
                            </div>
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
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-xs text-muted-foreground">Active</span>
                        <Switch
                          checked={u.is_active}
                          disabled={isMe || updateUser.isPending}
                          onCheckedChange={(v) => updateUser.mutate({ id: u.id, patch: { is_active: v } })}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
                            <SelectItem value="management">Management</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">Location</label>
                        <Select
                          value={u.area_id ?? "none"}
                          onValueChange={(v) =>
                            updateUser.mutate(
                              { id: u.id, patch: { area_id: v === "none" ? null : v } },
                              { onSuccess: () => toast.success("Location updated") },
                            )
                          }
                          disabled={updateUser.isPending}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Unassigned" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Unassigned</SelectItem>
                            {(areas ?? []).map((a) => (
                              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}
