import { ReactNode } from "react";
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
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth/AuthProvider";
import {
  ClipboardList,
  LayoutDashboard,
  LogOut,
  MapPin,
  ShieldCheck,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";
import logo317 from "@/assets/317-logo.png";

// AREA_MANAGER navigation. These items are always shown to area_manager
// users — do NOT gate them behind technician role. "My Reports" / "My
// Weekly Balance" use the AM's own user_id (40% commission applies).
const NAV = [
  { to: "/manager", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/manager/team", label: "Team Reports", icon: Users },
  { to: "/manager/mine", label: "My Reports", icon: ClipboardList },
  { to: "/manager/balance", label: "My Weekly Balance", icon: Wallet },
  { to: "/manager/technicians", label: "Technicians", icon: Wrench },
  { to: "/manager/areas", label: "Area Settings", icon: MapPin },
];

function ManagerSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border p-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black ring-1 ring-sidebar-border">
            <img src={logo317} alt="317 Garage Door" className="h-full w-full object-contain" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-[10px] font-medium uppercase tracking-wider text-sidebar-foreground/60">
                Area Manager
              </p>
              <p className="truncate font-display text-sm font-semibold text-sidebar-foreground">
                317 Garage Door
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

interface ManagerLayoutProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function ManagerLayout({ title, description, actions, children }: ManagerLayoutProps) {
  const { profile, signOut } = useAuth();

  return (
    <SidebarProvider defaultOpen>
      <div className="flex min-h-dvh w-full bg-background">
        <ManagerSidebar />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b bg-card/85 px-4 backdrop-blur-md md:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <SidebarTrigger />
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg gradient-accent shadow-glow">
                <ShieldCheck className="h-4 w-4 text-accent-foreground" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate font-display text-lg font-bold leading-tight">{title}</h1>
                {description && (
                  <p className="truncate text-xs text-muted-foreground">{description}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {actions}
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

          {/* Always-visible nav row — guarantees Area Manager menu is reachable
              on every screen size, regardless of sidebar collapsed state. */}
          <nav
            aria-label="Area Manager sections"
            className="sticky top-16 z-20 border-b bg-card/70 backdrop-blur-md"
          >
            <div className="mx-auto flex w-full max-w-7xl gap-1 overflow-x-auto px-3 py-2 md:px-6">
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-transparent px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  activeClassName="border-primary/30 bg-primary/10 text-primary"
                >
                  <item.icon className="h-3.5 w-3.5" />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          </nav>

          <main className="flex-1 overflow-x-hidden animate-fade-in">
            <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
