import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Send, BellRing, Bug } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getPushDebugInfo, sendTestPush, subscribeUserToPush } from "@/lib/push/client";
import { useAuth } from "@/auth/AuthProvider";

type EventType =
  | "report_submitted"
  | "report_returned"
  | "report_approved"
  | "report_opened"
  | "report_closed"
  | "commission_changed"
  | "admin_edited_report"
  | "pending_signup";

type Audience = "admins" | "area_managers" | "technicians" | "specific_users";

interface SettingRow {
  id: string;
  event_type: EventType;
  audience: Audience;
  push_enabled: boolean;
  in_app_enabled: boolean;
  enabled: boolean;
}

const EVENTS: { key: EventType; label: string; desc: string }[] = [
  { key: "report_submitted", label: "Report submitted", desc: "Tech submitted their weekly report" },
  { key: "report_returned", label: "Report returned", desc: "Admin returned a report for corrections" },
  { key: "report_approved", label: "Report approved", desc: "Admin approved/verified a report" },
  { key: "report_opened", label: "Report opened for the week", desc: "New weekly draft created" },
  { key: "report_closed", label: "Week closed", desc: "Admin locked the week" },
  { key: "commission_changed", label: "Commission changed", desc: "Admin overrode commission on a report" },
  { key: "admin_edited_report", label: "Admin edited report/job", desc: "Admin made edits to an existing report" },
  { key: "pending_signup", label: "Pending technician signup", desc: "New tech awaiting approval" },
];

const AUDIENCES: { key: Audience; label: string }[] = [
  { key: "admins", label: "Admins" },
  { key: "area_managers", label: "Area Managers" },
  { key: "technicians", label: "Technicians" },
];

export default function AdminNotifications() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [testing, setTesting] = useState(false);
  const [debug, setDebug] = useState<Awaited<ReturnType<typeof getPushDebugInfo>> | null>(null);
  const [lastAttempt, setLastAttempt] = useState<{
    at: string;
    code: string;
    message: string;
    detail?: string;
    inAppCreated?: boolean;
    delivered?: number;
    attempts?: number;
  } | null>(null);

  const refreshDebug = async () => {
    if (!user) return;
    setDebug(await getPushDebugInfo(user.id));
  };
  useEffect(() => { refreshDebug(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.id]);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["notification_settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_settings")
        .select("id, event_type, audience, push_enabled, in_app_enabled, enabled");
      if (error) throw error;
      return (data ?? []) as SettingRow[];
    },
  });

  const map = useMemo(() => {
    const m = new Map<string, SettingRow>();
    rows.forEach((r) => m.set(`${r.event_type}:${r.audience}`, r));
    return m;
  }, [rows]);

  const upsert = useMutation({
    mutationFn: async (input: {
      event_type: EventType;
      audience: Audience;
      patch: Partial<Pick<SettingRow, "enabled" | "push_enabled" | "in_app_enabled">>;
      existing: SettingRow | undefined;
    }) => {
      if (input.existing) {
        const { error } = await supabase
          .from("notification_settings")
          .update(input.patch)
          .eq("id", input.existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("notification_settings").insert({
          event_type: input.event_type,
          audience: input.audience,
          enabled: input.patch.enabled ?? false,
          push_enabled: input.patch.push_enabled ?? true,
          in_app_enabled: input.patch.in_app_enabled ?? true,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notification_settings"] }),
    onError: (e: any) => toast.error(e?.message ?? "Could not save"),
  });

  const handleTest = async () => {
    if (!user) return;
    setTesting(true);
    try {
      const sub = await subscribeUserToPush(user.id);
      if (!sub.ok) {
        const map: Record<string, string> = {
          denied: "Permission blocked — allow notifications in browser settings",
          preview: "Push only works in the installed/published app",
          unsupported: "Notifications not supported on this device",
          error: "Could not enable notifications on this device",
        };
        const msg = map[sub.reason ?? "error"] ?? "Could not enable notifications";
        toast.error(msg);
        setLastAttempt({ at: new Date().toISOString(), code: sub.reason ?? "error", message: msg });
        await refreshDebug();
        return;
      }

      const res = await sendTestPush();
      setLastAttempt({
        at: new Date().toISOString(),
        code: res.code,
        message: res.message,
        detail: res.detail,
        inAppCreated: res.inAppCreated,
        delivered: res.delivered,
        attempts: res.attempts,
      });
      if (res.ok) {
        toast.success(res.message);
      } else if (res.code === "no_subscription") {
        toast.error(res.message, { description: "An in-app notification was created instead." });
      } else {
        toast.error(res.message, { description: res.detail });
      }
      await refreshDebug();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not send test notification";
      toast.error("Could not send test notification", { description: msg });
      setLastAttempt({ at: new Date().toISOString(), code: "error", message: msg });
    } finally {
      setTesting(false);
    }
  };

  return (
    <AdminLayout
      title="Notification Management"
      description="Choose who receives each event type, on push and in-app."
      actions={
        <Button onClick={handleTest} disabled={testing} size="sm">
          {testing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
          Send test notification
        </Button>
      }
    >
      <div className="space-y-4">
        <Card>
          <CardContent className="flex items-start gap-3 p-4">
            <BellRing className="mt-0.5 h-5 w-5 text-primary" />
            <div className="text-sm">
              <p className="font-medium">How this works</p>
              <p className="text-muted-foreground">
                Each event below can be sent as a <b>push notification</b> (mobile/desktop) and/or
                an <b>in-app notification</b> (bell icon). Audiences can be enabled independently.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bug className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Push diagnostics (this device)</h3>
              </div>
              <Button variant="outline" size="sm" onClick={refreshDebug} className="h-7 text-xs">
                Refresh
              </Button>
            </div>
            {!debug ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : (
              <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                <DebugRow label="Browser supports push" value={debug.supported ? "Yes" : "No"} ok={debug.supported} />
                <DebugRow label="Inside editor preview" value={debug.inIframe ? "Yes (push disabled)" : "No"} ok={!debug.inIframe} />
                <DebugRow
                  label="Permission"
                  value={debug.permission}
                  ok={debug.permission === "granted"}
                  warn={debug.permission === "default"}
                />
                <DebugRow label="Service worker active" value={debug.swActive ? "Yes" : "No"} ok={debug.swActive} />
                <DebugRow
                  label="Device subscription"
                  value={debug.deviceEndpoint ? "Yes" : "No"}
                  ok={!!debug.deviceEndpoint}
                />
                <DebugRow
                  label="Saved on server"
                  value={`${debug.serverSubscriptions.length} device(s)`}
                  ok={debug.serverSubscriptions.length > 0}
                />
                {debug.deviceEndpoint && (
                  <div className="col-span-full break-all rounded bg-muted/40 p-2 font-mono text-[10px] text-muted-foreground">
                    {debug.deviceEndpoint.slice(0, 90)}…
                  </div>
                )}
              </div>
            )}

            {lastAttempt && (
              <div className="mt-3 rounded-lg border bg-muted/30 p-3 text-xs">
                <p className="font-semibold">Last test attempt</p>
                <p className="text-muted-foreground">{new Date(lastAttempt.at).toLocaleString()}</p>
                <p className="mt-1">
                  <span className="font-medium">Result:</span>{" "}
                  <span className={lastAttempt.code === "sent" ? "text-emerald-600" : "text-destructive"}>
                    {lastAttempt.message}
                  </span>
                </p>
                {typeof lastAttempt.delivered === "number" && (
                  <p>
                    <span className="font-medium">Delivered:</span> {lastAttempt.delivered}/{lastAttempt.attempts}
                  </p>
                )}
                {lastAttempt.inAppCreated !== undefined && (
                  <p>
                    <span className="font-medium">In-app fallback created:</span>{" "}
                    {lastAttempt.inAppCreated ? "Yes" : "No"}
                  </p>
                )}
                {lastAttempt.detail && (
                  <p className="mt-1 break-all text-muted-foreground">Detail: {lastAttempt.detail}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            {EVENTS.map((ev) => (
              <Card key={ev.key}>
                <CardContent className="p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold">{ev.label}</h3>
                      <p className="text-xs text-muted-foreground">{ev.desc}</p>
                    </div>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {ev.key}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                    {AUDIENCES.map((aud) => {
                      const row = map.get(`${ev.key}:${aud.key}`);
                      const enabled = row?.enabled ?? false;
                      const push = row?.push_enabled ?? true;
                      const inApp = row?.in_app_enabled ?? true;
                      return (
                        <div
                          key={aud.key}
                          className={`rounded-lg border p-3 transition ${
                            enabled ? "bg-primary/5" : "bg-muted/30"
                          }`}
                        >
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-sm font-medium">{aud.label}</span>
                            <Switch
                              checked={enabled}
                              onCheckedChange={(v) =>
                                upsert.mutate({
                                  event_type: ev.key,
                                  audience: aud.key,
                                  existing: row,
                                  patch: { enabled: v },
                                })
                              }
                            />
                          </div>
                          <div className="space-y-1.5 text-xs">
                            <label className="flex items-center justify-between">
                              <span className="text-muted-foreground">Push</span>
                              <Switch
                                checked={push}
                                disabled={!enabled}
                                onCheckedChange={(v) =>
                                  upsert.mutate({
                                    event_type: ev.key,
                                    audience: aud.key,
                                    existing: row,
                                    patch: { push_enabled: v },
                                  })
                                }
                              />
                            </label>
                            <label className="flex items-center justify-between">
                              <span className="text-muted-foreground">In-app</span>
                              <Switch
                                checked={inApp}
                                disabled={!enabled}
                                onCheckedChange={(v) =>
                                  upsert.mutate({
                                    event_type: ev.key,
                                    audience: aud.key,
                                    existing: row,
                                    patch: { in_app_enabled: v },
                                  })
                                }
                              />
                            </label>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
