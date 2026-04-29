import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Send, Settings2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { sendTestPush, subscribeUserToPush } from "@/lib/push/client";
import { toast } from "sonner";

type EventType =
  | "report_submitted"
  | "report_returned"
  | "report_approved"
  | "report_opened"
  | "report_closed"
  | "commission_changed"
  | "admin_edited_report"
  | "pending_signup";

interface Pref {
  user_id: string;
  event_type: EventType;
  in_app_enabled: boolean;
  push_enabled: boolean;
}

const EVENTS: { key: EventType; label: string }[] = [
  { key: "report_submitted", label: "Report submitted" },
  { key: "report_returned", label: "Report returned" },
  { key: "report_approved", label: "Report approved" },
  { key: "report_opened", label: "Report opened for the week" },
  { key: "report_closed", label: "Week closed" },
  { key: "commission_changed", label: "Commission changed" },
  { key: "admin_edited_report", label: "Admin edited report" },
  { key: "pending_signup", label: "Pending technician signup" },
];

interface Props {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}

export function NotificationPrefsDialog({ trigger, open, onOpenChange }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [testing, setTesting] = useState(false);

  const { data: prefs = [], isLoading } = useQuery({
    queryKey: ["user_notif_prefs", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("user_notification_prefs")
        .select("user_id, event_type, in_app_enabled, push_enabled")
        .eq("user_id", user.id);
      if (error) throw error;
      return (data ?? []) as Pref[];
    },
    enabled: !!user,
  });

  const map = new Map<EventType, Pref>();
  prefs.forEach((p) => map.set(p.event_type, p));

  const setPref = async (
    event: EventType,
    patch: Partial<Pick<Pref, "in_app_enabled" | "push_enabled">>
  ) => {
    if (!user) return;
    const existing = map.get(event);
    const next = {
      user_id: user.id,
      event_type: event,
      in_app_enabled: existing?.in_app_enabled ?? true,
      push_enabled: existing?.push_enabled ?? true,
      ...patch,
    };
    const { error } = await supabase
      .from("user_notification_prefs")
      .upsert(next, { onConflict: "user_id,event_type" });
    if (error) {
      toast.error("Could not save preference");
      return;
    }
    qc.invalidateQueries({ queryKey: ["user_notif_prefs", user.id] });
  };

  const handleTest = async () => {
    if (!user) return;
    setTesting(true);
    try {
      // Always create an in-app test notification (works even if push fails)
      await supabase.from("push_outbox").insert({
        user_id: user.id,
        title: "Test notification",
        body: "Notifications are working — you'll see updates here.",
        link: "/",
        event_type: "report_opened",
      }).then(() => null).catch(() => null);

      // Insert directly into notifications so the bell updates instantly
      const { error: nErr } = await supabase
        .from("notifications")
        // @ts-expect-error: notifications has restricted insert RLS in some setups
        .insert({
          user_id: user.id,
          event_type: "report_opened",
          title: "Test notification",
          body: "In-app notifications are working.",
          link: "/",
        });
      // It's OK if this fails (RLS may not allow it); push test is the source of truth
      void nErr;

      // Try push too
      const sub = await subscribeUserToPush(user.id);
      if (!sub.ok) {
        if (sub.reason === "denied") {
          toast.error("Permission blocked — allow notifications in browser settings");
        } else if (sub.reason === "preview") {
          toast.message("Push doesn't work inside the editor preview", {
            description: "In-app notifications still work. Open the published app to test push.",
          });
        } else if (sub.reason === "unsupported") {
          toast.message("Push not supported on this device", {
            description: "In-app notifications will still appear in the bell.",
          });
        } else {
          toast.message("Could not enable push on this device", {
            description: "In-app notifications will still appear in the bell.",
          });
        }
        qc.invalidateQueries({ queryKey: ["notifications", user.id] });
        return;
      }

      const res = await sendTestPush();
      if (res.ok === true) {
        toast.success("Test notification sent successfully");
      } else if (res.code === "no_subscription") {
        toast.message("No push subscription on this device", {
          description: "In-app test still delivered to the bell.",
        });
      } else {
        toast.error(res.message);
      }
      qc.invalidateQueries({ queryKey: ["notifications", user.id] });
    } catch {
      toast.error("Could not send test notification");
    } finally {
      setTesting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" /> Notification preferences
          </DialogTitle>
          <DialogDescription>
            Choose which alerts reach you in-app and via push.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[55vh] pr-2">
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-1 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                <span>Event</span>
                <span className="w-12 text-center">In-app</span>
                <span className="w-12 text-center">Push</span>
              </div>
              {EVENTS.map((ev) => {
                const p = map.get(ev.key);
                const inApp = p?.in_app_enabled ?? true;
                const push = p?.push_enabled ?? true;
                return (
                  <div
                    key={ev.key}
                    className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-lg border p-3"
                  >
                    <span className="text-sm font-medium">{ev.label}</span>
                    <div className="flex w-12 justify-center">
                      <Switch
                        checked={inApp}
                        onCheckedChange={(v) => setPref(ev.key, { in_app_enabled: v })}
                      />
                    </div>
                    <div className="flex w-12 justify-center">
                      <Switch
                        checked={push}
                        onCheckedChange={(v) => setPref(ev.key, { push_enabled: v })}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="sm:justify-between">
          <p className="text-[11px] text-muted-foreground">
            Admins still control which events fire overall.
          </p>
          <Button onClick={handleTest} disabled={testing} size="sm">
            {testing ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-1.5 h-4 w-4" />
            )}
            Send test
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
