import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { NavLink } from "@/components/NavLink";
import { NotificationBell } from "@/components/NotificationBell";
import { RefreshButton } from "@/components/RefreshButton";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth/AuthProvider";
import {
  Building2,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Settings,
  UserCog,
  Users,
  Wrench,
  FileBarChart2,
} from "lucide-react";
import logo317 from "@/assets/317-logo.png";

const NAV = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/reports", label: "Reports", icon: FileBarChart2 },
  { to: "/admin/technicians", label: "Technicians", icon: Wrench },
  { to: "/admin/managers", label: "Area Managers", icon: UserCog },
  { to: "/admin/providers", label: "Providers", icon: Users },
  { to: "/admin/office-jobs", label: "Office Jobs", icon: ClipboardList },
  { to: "/admin/company", label: "Company", icon: Building2 },
  { to: "/admin/settings", label: "Settings", icon: Settings },
];

function AdminSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="min-h-[72px] border-b border-sidebar-border p-3">
        <div className="flex h-full items-center gap-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black ring-1 ring-sidebar-border">
            <img src={logo317} alt="317 Garage Door" className="h-full w-full object-contain" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-[10px] font-medium uppercase tracking-wider text-sidebar-foreground/60">
                317 Garage Door
              </p>
              <p className="truncate font-display text-sm font-semibold text-sidebar-foreground">
                Weekly Balance System
              </p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel>Workspace</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton asChild tooltip={item.label}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      className="text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                      activeClassName="bg-sidebar-accent text-sidebar-foreground font-medium"
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

interface AdminLayoutProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function AdminLayout({ title, description, actions, children }: AdminLayoutProps) {
  const { profile, signOut } = useAuth();
  const nav = useNavigate();

  return (
    <SidebarProvider>
      <div className="flex min-h-dvh w-full bg-background">
        <AdminSidebar />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b bg-card/85 px-3 backdrop-blur-md md:h-16 md:px-6 md:pwa-pt-safe pwa-header h-14">
            <div className="flex min-w-0 items-center gap-2 md:gap-3">
              <SidebarTrigger className="shrink-0" />
              <div className="min-w-0">
                <h1 className="truncate font-display text-base font-bold leading-tight md:text-lg">{title}</h1>
                {description && (
                  <p className="hidden truncate text-xs text-muted-foreground sm:block">{description}</p>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1 md:gap-2">
              {actions}
              <RefreshButton />
              <NotificationBell />
              {profile?.full_name && (
                <div className="mx-1 hidden items-center gap-2 rounded-full border bg-muted/40 px-3 py-1 sm:flex">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                    {profile.full_name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-xs font-medium text-foreground">{profile.full_name}</span>
                </div>
              )}
              <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </header>

          <main className="flex-1 overflow-x-hidden animate-fade-in pwa-pb-safe">
            <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

/* Shared building blocks */

interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  icon?: React.ComponentType<{ className?: string }>;
  trend?: { value: string; positive?: boolean };
}

export function StatCard({ label, value, hint, icon: Icon, trend }: StatCardProps) {
  return (
    <div className="group relative overflow-hidden rounded-xl border bg-card p-4 shadow-sm transition hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="num mt-1.5 font-display text-2xl font-semibold tabular-nums">{value}</p>
          {(hint || trend) && (
            <div className="mt-1 flex items-center gap-2 text-xs">
              {trend && (
                <span
                  className={
                    trend.positive
                      ? "rounded-full bg-[hsl(var(--success))]/10 px-1.5 py-0.5 font-medium text-[hsl(var(--success))]"
                      : "rounded-full bg-destructive/10 px-1.5 py-0.5 font-medium text-destructive"
                  }
                >
                  {trend.value}
                </span>
              )}
              {hint && <span className="truncate text-muted-foreground">{hint}</span>}
            </div>
          )}
        </div>
        {Icon && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition group-hover:bg-primary group-hover:text-primary-foreground">
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
    </div>
  );
}

export function DemoBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-warning">
      <span className="h-1.5 w-1.5 rounded-full bg-warning" />
      Demo data
    </span>
  );
}
