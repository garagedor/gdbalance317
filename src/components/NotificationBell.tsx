import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, BellRing, Check, Loader2, Settings2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  isPushSupported,
  subscribeUserToPush,
  unsubscribeFromPush,
} from "@/lib/push/client";
import { toast } from "sonner";
import { NotificationPrefsDialog } from "./NotificationPrefsDialog";

interface NotificationRow {
  id: string;
  title: string;
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
  event_type: string;
}

export function NotificationBell() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [subscribing, setSubscribing] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported"
  );

  const { data: rows = [] } = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("notifications")
        .select("id, title, body, link, read_at, created_at, event_type")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as NotificationRow[];
    },
    enabled: !!user,
    refetchInterval: 30_000,
  });

  // Realtime updates
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`notif-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ["notifications", user.id] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id, qc, user]);

  const unread = rows.filter((r) => !r.read_at).length;

  const enable = async () => {
    if (!user) return;
    setSubscribing(true);
    try {
      const res = await subscribeUserToPush(user.id);
      setPermission(typeof Notification !== "undefined" ? Notification.permission : "unsupported");
      if (res.ok) {
        toast.success("Notifications enabled");
      } else if (res.reason === "denied") {
        toast.error(
          "Notifications blocked. Enable them in your browser site settings, then try again."
        );
      } else if (res.reason === "preview") {
        toast.message("Push works in the installed/published app", {
          description: "In-app notifications still work here.",
        });
      } else if (res.reason === "unsupported") {
        toast.error("This browser does not support push notifications.");
      } else {
        toast.error("Could not enable notifications.");
      }
    } finally {
      setSubscribing(false);
    }
  };

  const disable = async () => {
    setSubscribing(true);
    try {
      await unsubscribeFromPush();
      toast.success("Push disabled (in-app notifications still on)");
    } finally {
      setSubscribing(false);
    }
  };

  const markAllRead = async () => {
    await supabase.rpc("mark_all_notifications_read");
    qc.invalidateQueries({ queryKey: ["notifications", user?.id] });
  };

  const open = async (n: NotificationRow) => {
    if (!n.read_at) {
      await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
      qc.invalidateQueries({ queryKey: ["notifications", user?.id] });
    }
    if (n.link) nav(n.link);
  };

  if (!user) return null;

  const supported = isPushSupported();

  return (
    <>
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between gap-1 border-b px-3 py-2">
          <div className="text-sm font-semibold">Notifications</div>
          <div className="flex items-center gap-1">
            {unread > 0 && (
              <Button variant="ghost" size="sm" onClick={markAllRead} className="h-7 px-2 text-xs">
                <Check className="mr-1 h-3.5 w-3.5" /> Mark all read
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setPrefsOpen(true)}
              aria-label="Notification preferences"
            >
              <Settings2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="border-b bg-muted/40 px-3 py-2">
          {!supported ? (
            <p className="text-xs text-muted-foreground">
              This browser doesn't support push. You'll still see in-app alerts here.
            </p>
          ) : permission === "denied" ? (
            <p className="text-xs text-muted-foreground">
              Push is blocked. Open your browser site settings → Notifications → Allow, then reload.
            </p>
          ) : permission === "granted" ? (
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs text-emerald-600">
                <BellRing className="h-3.5 w-3.5" /> Push enabled on this device
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={disable}
                disabled={subscribing}
                className="h-7 px-2 text-xs"
              >
                {subscribing ? <Loader2 className="h-3 w-3 animate-spin" /> : <BellOff className="h-3.5 w-3.5" />}
                <span className="ml-1">Disable</span>
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs text-muted-foreground">
                Get alerts when reports open, are returned, or approved.
              </p>
              <Button size="sm" onClick={enable} disabled={subscribing} className="h-8">
                {subscribing ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <BellRing className="mr-1.5 h-3.5 w-3.5" />
                )}
                Enable notifications
              </Button>
            </div>
          )}
        </div>

        <ScrollArea className="max-h-[60vh]">
          {rows.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No notifications yet</p>
          ) : (
            <ul className="divide-y">
              {rows.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => open(n)}
                    className={`w-full px-3 py-2.5 text-left transition hover:bg-muted/50 ${
                      n.read_at ? "" : "bg-primary/5"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium">{n.title}</div>
                      {!n.read_at && (
                        <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                          new
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {new Date(n.created_at).toLocaleString()}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
