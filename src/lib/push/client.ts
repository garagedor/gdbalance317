import { supabase } from "@/integrations/supabase/client";
import { VAPID_PUBLIC_KEY } from "./vapid";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

function bufToB64(buf: ArrayBuffer | null): string {
  if (!buf) return "";
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
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

let swRegistration: ServiceWorkerRegistration | null = null;

export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  if (isPreviewIframe()) {
    // Avoid registering inside the editor preview iframe — it interferes
    // with navigation and hot reload. Push will work in the published app.
    return null;
  }
  if (swRegistration) return swRegistration;
  try {
    swRegistration = await navigator.serviceWorker.register("/push-sw.js", { scope: "/" });
    return swRegistration;
  } catch (e) {
    console.error("SW registration failed", e);
    return null;
  }
}

export async function subscribeUserToPush(userId: string): Promise<{
  ok: boolean;
  reason?: "unsupported" | "preview" | "denied" | "error";
}> {
  if (!isPushSupported()) return { ok: false, reason: "unsupported" };
  if (isPreviewIframe()) return { ok: false, reason: "preview" };

  let permission = Notification.permission;
  if (permission === "default") permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "denied" };

  const reg = await ensureServiceWorker();
  if (!reg) return { ok: false, reason: "error" };

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const json: any = sub.toJSON();
  const endpoint: string = sub.endpoint;
  const p256dh: string = json?.keys?.p256dh ?? bufToB64(sub.getKey("p256dh"));
  const auth: string = json?.keys?.auth ?? bufToB64(sub.getKey("auth"));

  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        user_id: userId,
        endpoint,
        p256dh,
        auth,
        user_agent: navigator.userAgent,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" }
    );
  if (error) {
    console.error("Saving push subscription failed", error);
    return { ok: false, reason: "error" };
  }
  return { ok: true };
}

export async function unsubscribeFromPush(): Promise<void> {
  const reg = await ensureServiceWorker();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  }
}

export async function sendTestPush(): Promise<void> {
  const { error } = await supabase.functions.invoke("send-push", {
    body: { test: true },
  });
  if (error) throw error;
}
