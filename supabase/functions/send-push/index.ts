// Pure-Deno Web Push (RFC 8291 / aes128gcm) + VAPID JWT (ES256).
// No npm:web-push — that library hits Deno.core.runMicrotasks on Supabase
// Edge Runtime. We sign and encrypt using the built-in Web Crypto API.
import { createClient } from "npm:@supabase/supabase-js@2.49.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@317garagedoor.com";
const VAPID_OK = !!VAPID_PUBLIC && !!VAPID_PRIVATE;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------- base64url helpers ----------
function b64uToBytes(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64u(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function strToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}
function concat(...arrs: Uint8Array[]): Uint8Array {
  const len = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const a of arrs) { out.set(a, off); off += a.length; }
  return out;
}

// ---------- VAPID JWT (ES256) ----------
async function importVapidPrivateKey(): Promise<CryptoKey> {
  // VAPID_PRIVATE is the raw 32-byte d value, base64url
  const d = b64uToBytes(VAPID_PRIVATE);
  const pub = b64uToBytes(VAPID_PUBLIC); // 0x04 || X(32) || Y(32)
  if (pub.length !== 65 || pub[0] !== 0x04) throw new Error("Bad VAPID public key");
  const x = pub.slice(1, 33);
  const y = pub.slice(33, 65);
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x: bytesToB64u(x),
    y: bytesToB64u(y),
    d: bytesToB64u(d),
    ext: true,
  };
  return await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
}

async function vapidAuthHeader(audience: string): Promise<string> {
  const header = { typ: "JWT", alg: "ES256" };
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;
  const payload = { aud: audience, exp, sub: VAPID_SUBJECT };
  const h = bytesToB64u(strToBytes(JSON.stringify(header)));
  const p = bytesToB64u(strToBytes(JSON.stringify(payload)));
  const data = strToBytes(`${h}.${p}`);
  const key = await importVapidPrivateKey();
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, data);
  const jwt = `${h}.${p}.${bytesToB64u(sig)}`;
  return `vapid t=${jwt}, k=${VAPID_PUBLIC}`;
}

// ---------- aes128gcm payload encryption (RFC 8291) ----------
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    key,
    len * 8
  );
  return new Uint8Array(bits);
}

async function encryptPayload(
  payload: Uint8Array,
  uaPublicB64u: string,
  authSecretB64u: string
): Promise<Uint8Array> {
  const uaPublic = b64uToBytes(uaPublicB64u);  // 65 bytes uncompressed
  const authSecret = b64uToBytes(authSecretB64u); // 16 bytes

  // Generate ephemeral ECDH keypair on P-256
  const eph = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );
  const ephPubJwk = await crypto.subtle.exportKey("jwk", eph.publicKey);
  const asPubX = b64uToBytes(ephPubJwk.x!);
  const asPubY = b64uToBytes(ephPubJwk.y!);
  const asPublic = concat(new Uint8Array([0x04]), asPubX, asPubY); // 65 bytes

  // Import UA public for ECDH
  const uaPubKey = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      x: bytesToB64u(uaPublic.slice(1, 33)),
      y: bytesToB64u(uaPublic.slice(33, 65)),
      ext: true,
    },
    { name: "ECDH", namedCurve: "P-256" },
    true,
    []
  );
  const sharedBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: uaPubKey },
    eph.privateKey,
    256
  );
  const ecdhSecret = new Uint8Array(sharedBits);

  // PRK_key = HKDF(authSecret, ecdhSecret, "WebPush: info\0" || ua_public || as_public, 32)
  const keyInfo = concat(
    strToBytes("WebPush: info\0"),
    uaPublic,
    asPublic,
  );
  const prkKey = await hkdf(authSecret, ecdhSecret, keyInfo, 32);

  // salt = 16 random bytes
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // CEK = HKDF(salt, prkKey, "Content-Encoding: aes128gcm\0", 16)
  const cek = await hkdf(salt, prkKey, concat(strToBytes("Content-Encoding: aes128gcm\0")), 16);
  // NONCE = HKDF(salt, prkKey, "Content-Encoding: nonce\0", 12)
  const nonce = await hkdf(salt, prkKey, concat(strToBytes("Content-Encoding: nonce\0")), 12);

  // Plaintext = payload || 0x02 (single record, last)
  const plaintext = concat(payload, new Uint8Array([0x02]));
  const cekKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, cekKey, plaintext)
  );

  // Header: salt(16) | rs(4 BE = 4096) | idlen(1) | keyid(asPublic 65)
  const rs = new Uint8Array([0x00, 0x00, 0x10, 0x00]); // 4096
  const header = concat(salt, rs, new Uint8Array([asPublic.length]), asPublic);
  return concat(header, ct);
}

// ---------- send one notification ----------
interface SubRow { endpoint: string; p256dh: string; auth: string }

async function sendOne(sub: SubRow, payloadJson: string): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const u = new URL(sub.endpoint);
    const audience = `${u.protocol}//${u.host}`;
    const authHeader = await vapidAuthHeader(audience);
    const body = await encryptPayload(strToBytes(payloadJson), sub.p256dh, sub.auth);

    const resp = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        "Authorization": authHeader,
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aes128gcm",
        "TTL": "86400",
        "Urgency": "normal",
      },
      body,
    });
    const text = resp.ok ? "" : await resp.text().catch(() => "");
    if (!resp.ok) {
      console.error("push send failed", resp.status, text.slice(0, 300));
      return { ok: false, status: resp.status, error: text.slice(0, 300) };
    }
    return { ok: true, status: resp.status };
  } catch (err) {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error("push send threw", msg);
    return { ok: false, error: msg };
  }
}

interface OutboxRow {
  id: string; user_id: string; title: string; body: string; link: string | null; event_type: string;
}

async function deliver(rows: OutboxRow[]) {
  let delivered = 0, removed = 0, failed = 0;
  const byUser = new Map<string, OutboxRow[]>();
  for (const r of rows) {
    const arr = byUser.get(r.user_id) ?? [];
    arr.push(r); byUser.set(r.user_id, arr);
  }
  for (const [userId, items] of byUser) {
    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", userId);
    if (!subs || subs.length === 0) continue;

    for (const item of items) {
      const payload = JSON.stringify({
        title: item.title, body: item.body, link: item.link ?? "/",
        event_type: item.event_type, tag: item.event_type,
      });
      for (const s of subs as SubRow[]) {
        const r = await sendOne(s, payload);
        if (r.ok) delivered++;
        else if (r.status === 404 || r.status === 410) {
          await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
          removed++;
        } else failed++;
      }
    }
  }
  return { delivered, removed, failed };
}

async function getCallerUserId(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization");
  if (!auth) return null;
  const token = auth.replace(/^Bearer\s+/i, "");
  const { data } = await admin.auth.getUser(token);
  return data.user?.id ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    let body: { test?: boolean; debug?: boolean } = {};
    if (req.method === "POST") { try { body = await req.json(); } catch { /* ignore */ } }

    if (!VAPID_OK) {
      return new Response(
        JSON.stringify({ ok: false, code: "vapid_missing", error: "Push setup missing VAPID keys" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ----- Test mode: send a test push to caller and create in-app fallback -----
    if (body.test === true) {
      const uid = await getCallerUserId(req);
      if (!uid) {
        return new Response(
          JSON.stringify({ ok: false, code: "unauthenticated", error: "Not authenticated" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: subs } = await admin
        .from("push_subscriptions")
        .select("endpoint, p256dh, auth")
        .eq("user_id", uid);

      // Always create in-app fallback notification
      await admin.from("notifications").insert({
        user_id: uid,
        event_type: "report_opened",
        title: "Test notification",
        body: "If you also see a system banner, push delivery is working.",
        link: "/",
      } as never);

      if (!subs || subs.length === 0) {
        return new Response(
          JSON.stringify({
            ok: false, code: "no_subscription",
            error: "No push subscription on this device",
            in_app_created: true,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const payload = JSON.stringify({
        title: "Test notification",
        body: "Push notifications are working on this device.",
        link: "/",
        event_type: "report_opened",
        tag: "test",
      });

      const results: Array<{ ok: boolean; status?: number; error?: string }> = [];
      for (const s of subs as SubRow[]) {
        const r = await sendOne(s, payload);
        results.push(r);
        if (!r.ok && (r.status === 404 || r.status === 410)) {
          await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        }
      }
      const anyOk = results.some((r) => r.ok);
      const firstErr = results.find((r) => !r.ok);
      return new Response(
        JSON.stringify({
          ok: anyOk,
          code: anyOk ? "sent" : "push_failed",
          attempts: results.length,
          delivered: results.filter((r) => r.ok).length,
          last_status: firstErr?.status ?? null,
          last_error: firstErr?.error ?? null,
          in_app_created: true,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ----- Outbox flush -----
    const { data: rows, error } = await admin.rpc("claim_pending_push_batch", { _limit: 100 });
    if (error) throw error;
    const stats = rows && rows.length > 0
      ? await deliver(rows as OutboxRow[])
      : { delivered: 0, removed: 0, failed: 0 };
    return new Response(
      JSON.stringify({ ok: true, claimed: rows?.length ?? 0, ...stats }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : JSON.stringify(e);
    console.error("send-push error", msg);
    return new Response(
      JSON.stringify({ ok: false, code: "internal_error", error: msg }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
