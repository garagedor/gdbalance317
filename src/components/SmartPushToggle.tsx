import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BellOff, BellRing, Loader2, Send, ShieldAlert, Smartphone } from "lucide-react";
import {
  ensureServiceWorker,
  isPushSupported,
  sendTestPush,
  subscribeUserToPush,
  unsubscribeFromPush,
} from "@/lib/push/client";
import { useAuth } from "@/auth/AuthProvider";
import { toast } from "sonner";

type Status =
  | "loading"
  | "unsupported"
  | "ios_pwa_required"
  | "preview"
  | "blocked"
  | "enabled"
  | "disabled";

function isiOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
}
function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true
  );
}
function isPreviewIframe(): boolean {
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  const h = window.location.hostname;
  return h.includes("id-preview--") || h.includes("lovableproject.com");
}

/**
 * One smart button that:
 *  - Detects support, permission, and current subscription state
 *  - Enable → asks permission, registers SW, creates push subscription, saves
 *  - Disable → unsubscribes locally and removes server-side row
 *  - Shows clear status text underneath for every edge case
 */
export function SmartPushToggle() {
  const { user } = useAuth();
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  const refresh = async () => {
    if (!isPushSupported()) {
      setStatus(isiOS() && !isStandalone() ? "ios_pwa_required" : "unsupported");
      return;
    }
    if (isPreviewIframe()) {
      setStatus("preview");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("blocked");
      return;
    }
    try {
      const reg = await ensureServiceWorker();
      const sub = await reg?.pushManager.getSubscription();
      setStatus(sub && Notification.permission === "granted" ? "enabled" : "disabled");
    } catch {
      setStatus("disabled");
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const enable = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const res = await subscribeUserToPush(user.id);
      if (res.ok) {
        toast.success("Notifications enabled on this device");
      } else if (res.reason === "denied") {
        toast.error("Permission blocked — allow notifications in browser settings");
      } else if (res.reason === "preview") {
        toast.message("Open the published app to enable push", {
          description: "Push doesn't work inside the editor preview.",
        });
      } else if (res.reason === "unsupported") {
        toast.error("This device doesn't support push notifications");
      } else {
        toast.error("Could not enable notifications on this device");
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      await unsubscribeFromPush();
      toast.success("Notifications disabled on this device");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      const res = await sendTestPush();
      if (res.ok) toast.success(res.message);
      else if (res.code === "no_subscription")
        toast.message(res.message, { description: "An in-app notification was created instead." });
      else toast.error(res.message, { description: res.detail });
    } finally {
      setTesting(false);
    }
  };

  const meta = STATUS_META[status];

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-full ${meta.iconWrap}`}
          >
            <meta.Icon className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold">{meta.title}</p>
            <p className="text-xs text-muted-foreground">{meta.subtitle}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {status === "enabled" ? (
            <Button onClick={disable} disabled={busy} variant="outline" size="sm">
              {busy ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <BellOff className="mr-1.5 h-4 w-4" />
              )}
              Disable notifications
            </Button>
          ) : status === "disabled" || status === "blocked" || status === "preview" ? (
            <Button
              onClick={enable}
              disabled={busy || status === "preview"}
              size="sm"
            >
              {busy ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <BellRing className="mr-1.5 h-4 w-4" />
              )}
              Enable notifications
            </Button>
          ) : null}
          {(status === "enabled" || status === "disabled") && (
            <Button
              onClick={test}
              disabled={testing}
              variant="ghost"
              size="sm"
              className="text-xs"
            >
              {testing ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="mr-1.5 h-3.5 w-3.5" />
              )}
              Send test
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

const STATUS_META: Record<
  Status,
  { title: string; subtitle: string; Icon: typeof BellRing; iconWrap: string }
> = {
  loading: {
    title: "Checking device…",
    subtitle: "Reading notification permission and subscription state.",
    Icon: Loader2,
    iconWrap: "bg-muted text-muted-foreground",
  },
  unsupported: {
    title: "Unsupported browser",
    subtitle: "This browser doesn't support push notifications. In-app alerts still work.",
    Icon: ShieldAlert,
    iconWrap: "bg-muted text-muted-foreground",
  },
  ios_pwa_required: {
    title: "Install the app on iPhone",
    subtitle: "On iOS, push only works after you Add to Home Screen and open the installed app.",
    Icon: Smartphone,
    iconWrap: "bg-amber-100 text-amber-700",
  },
  preview: {
    title: "Disabled in editor preview",
    subtitle: "Push works in the published app and installed PWA, not inside the editor iframe.",
    Icon: ShieldAlert,
    iconWrap: "bg-muted text-muted-foreground",
  },
  blocked: {
    title: "Permission blocked",
    subtitle: "Allow notifications in your browser/site settings, then click Enable again.",
    Icon: ShieldAlert,
    iconWrap: "bg-destructive/10 text-destructive",
  },
  enabled: {
    title: "Enabled on this device",
    subtitle: "You'll receive push notifications even when the app is closed.",
    Icon: BellRing,
    iconWrap: "bg-emerald-100 text-emerald-700",
  },
  disabled: {
    title: "Disabled on this device",
    subtitle: "Click Enable to start receiving push notifications.",
    Icon: BellOff,
    iconWrap: "bg-muted text-muted-foreground",
  },
};
