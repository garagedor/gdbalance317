import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Loader2, MapPin, Pencil, Plus, Trash2, X, Check } from "lucide-react";
import { toast } from "sonner";

interface Area { id: string; name: string }

export default function AdminAreas() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<Area | null>(null);

  const { data: areas, isLoading } = useQuery({
    queryKey: ["areas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("areas").select("id, name").order("name");
      if (error) throw error;
      return data as Area[];
    },
  });

  const createArea = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from("areas").insert({ name: name.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Location added");
      setNewName("");
      qc.invalidateQueries({ queryKey: ["areas"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to add location"),
  });

  const renameArea = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("areas").update({ name: name.trim() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Location updated");
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ["areas"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to update"),
  });

  const deleteArea = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("areas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Location deleted");
      setConfirmDelete(null);
      qc.invalidateQueries({ queryKey: ["areas"] });
      qc.invalidateQueries({ queryKey: ["technicians"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Cannot delete — it may be assigned to users or reports"),
  });

  if (profile?.role !== "management") return null;

  return (
    <AdminLayout title="Locations" description="Service regions and areas">
      <div className="mx-auto w-full max-w-3xl space-y-5">
        <Card>
          <CardContent className="space-y-3 p-4">
            <label className="text-sm font-medium">Add a new location</label>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (newName.trim()) createArea.mutate(newName);
              }}
            >
              <Input
                placeholder="e.g. Chicago North"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={120}
              />
              <Button type="submit" disabled={!newName.trim() || createArea.isPending}>
                {createArea.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                <span className="ml-1">Add</span>
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center py-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : !areas || areas.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">No locations yet.</div>
            ) : (
              <ul className="divide-y">
                {areas.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                    </div>
                    {editingId === a.id ? (
                      <>
                        <Input
                          autoFocus
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="flex-1"
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => renameArea.mutate({ id: a.id, name: editingName })}
                          disabled={!editingName.trim() || renameArea.isPending}
                          aria-label="Save"
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => setEditingId(null)} aria-label="Cancel">
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 font-medium">{a.name}</span>
                        <Button
                          size="icon" variant="ghost"
                          onClick={() => { setEditingId(a.id); setEditingName(a.name); }}
                          aria-label="Rename"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon" variant="ghost"
                          onClick={() => setConfirmDelete(a)}
                          aria-label="Delete"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this location?</AlertDialogTitle>
            <AlertDialogDescription>
              "{confirmDelete?.name}" will be permanently removed. This will fail if any users or reports are still assigned to it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDelete && deleteArea.mutate(confirmDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
