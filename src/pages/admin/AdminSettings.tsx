import { AdminLayout, DemoBadge } from "@/components/admin/AdminLayout";
import { useNavigate } from "react-router-dom";
import { ChevronRight, MapPin, Settings as SettingsIcon, Users } from "lucide-react";

const ITEMS = [
  { to: "/admin/users", icon: Users, label: "Users", desc: "Manage technicians, managers, and admins" },
  { to: "/admin/areas", icon: MapPin, label: "Areas", desc: "Service regions and locations" },
];

export default function AdminSettings() {
  const nav = useNavigate();
  return (
    <AdminLayout title="Settings" description="Workspace configuration" actions={<DemoBadge />}>
      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex items-center gap-3 border-b p-4">
          <SettingsIcon className="h-5 w-5 text-muted-foreground" />
          <h2 className="font-display text-base font-semibold">General</h2>
        </div>
        <ul className="divide-y">
          {ITEMS.map((it) => (
            <li key={it.to}>
              <button
                onClick={() => nav(it.to)}
                className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-muted/50"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                  <it.icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{it.label}</p>
                  <p className="text-xs text-muted-foreground">{it.desc}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </AdminLayout>
  );
}
