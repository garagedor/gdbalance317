import { useState } from "react";
import { useNavigate, useSearchParams, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import logo317 from "@/assets/317-logo.png";
import { InstallAppButton } from "@/components/InstallAppButton";

export default function Auth() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { session, profile, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [techMode, setTechMode] = useState<"signin" | "signup">("signin");
  const redirect = params.get("redirect") ?? null;

  if (!loading && session && profile) {
    const target =
      redirect ??
      (profile.role === "management"
        ? "/admin"
        : profile.role === "area_manager"
        ? "/manager"
        : profile.role === "office_staff"
        ? "/office"
        : "/tech");
    return <Navigate to={target} replace />;
  }

  // ---------- Staff (email) ----------
  const onStaffSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      console.error("[auth] staff signin error:", error);
      toast.error("Invalid email or password.");
    } else {
      toast.success("Welcome back");
    }
  };

  // Allow-list of safe, user-facing messages keyed by the function's `code`.
  // Anything not in the list (or any raw transport error) collapses to a
  // generic friendly message — we never surface stack traces, SQL errors,
  // or "non-2xx" text to end users.
  const FRIENDLY_BY_CODE: Record<string, string> = {
    // signup
    name_invalid: "Please enter your full name.",
    phone_invalid: "Please enter a valid phone number.",
    pin_invalid: "PIN must be exactly 4 digits.",
    code_required: "Company invite code is required.",
    code_invalid: "Invalid company invite code.",
    phone_exists: "This phone number is already registered.",
    code_lookup_failed: "Registration is temporarily unavailable. Please try again.",
    dup_lookup_failed: "Registration is temporarily unavailable. Please try again.",
    auth_create_failed: "Could not create your account. Please try again.",
    profile_failed: "Could not finish setting up your account. Please try again.",
    // login
    phone_required: "Enter your phone number.",
    not_found: "Account not found.",
    deactivated: "This account is deactivated. Contact your admin.",
    invalid_credentials: "Invalid phone or PIN.",
    pin_not_set: "PIN not set for this account yet. Ask your admin to reset it.",
    lookup_failed: "Server issue. Please contact admin.",
    // shared
    config: "Server issue. Please contact admin.",
    crash: "Something went wrong. Please try again.",
  };

  const friendlyError = async (
    fallback: string,
    error: unknown,
    data: { ok?: boolean; error?: string; code?: string } | null,
  ): Promise<string> => {
    // Prefer code → mapped message
    if (data?.code && FRIENDLY_BY_CODE[data.code]) return FRIENDLY_BY_CODE[data.code];
    // If the function spoke (data.error), trust its short text — it was
    // written by us and is already user-safe.
    if (data?.error && data.error.length < 160 && !/non-2xx|status code|stack|sql/i.test(data.error)) {
      return data.error;
    }
    // Try to read the response body for code, but never surface raw text.
    const ctxResp = (error as { context?: { response?: Response } } | null)?.context?.response;
    if (ctxResp) {
      try {
        const body = await ctxResp.clone().json();
        if (body?.code && FRIENDLY_BY_CODE[body.code]) return FRIENDLY_BY_CODE[body.code];
        if (body?.error && body.error.length < 160 && !/non-2xx|status code|stack|sql/i.test(body.error)) {
          return body.error;
        }
      } catch {
        /* ignore */
      }
    }
    // Log the real error for ops, return the generic message to the UI.
    if (error) console.error("[auth] hidden error:", error);
    if (data) console.error("[auth] hidden payload:", data);
    return fallback;
  };

  // ---------- Technician sign-in (phone + PIN) ----------
  const onTechSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const phone = String(fd.get("phone") ?? "").trim();
    const pin = String(fd.get("pin") ?? "").trim();
    if (!/^\d{4}$/.test(pin)) {
      toast.error("PIN must be 4 digits.");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("tech-login", {
      body: { phone, pin },
    });
    if (error || !data?.ok) {
      setBusy(false);
      toast.error(await friendlyError("Sign in failed. Please try again.", error, data));
      return;
    }
    const { error: setErr } = await supabase.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    });
    setBusy(false);
    if (setErr) {
      toast.error(setErr.message);
      return;
    }
    if (data.pending_approval) {
      toast.success("Signed in — your account is awaiting approval.");
      nav("/pending", { replace: true });
    } else {
      toast.success("Welcome back");
    }
  };

  // ---------- Technician sign-up (phone + PIN + invite code) ----------
  const onTechSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const full_name = String(fd.get("full_name") ?? "").trim();
    const phone = String(fd.get("phone") ?? "").trim();
    const pin = String(fd.get("pin") ?? "").trim();
    const pin2 = String(fd.get("pin2") ?? "").trim();
    const invite_code = String(fd.get("invite_code") ?? "").trim();

    if (!/^\d{4}$/.test(pin)) return toast.error("PIN must be 4 digits.");
    if (pin !== pin2) return toast.error("PINs do not match.");

    setBusy(true);
    const { data, error } = await supabase.functions.invoke("tech-signup", {
      body: { full_name, phone, pin, invite_code },
    });
    if (error || !data?.ok) {
      setBusy(false);
      toast.error(await friendlyError("Registration is temporarily unavailable. Please try again.", error, data));
      return;
    }

    // Auto-login right after signup.
    const { data: login } = await supabase.functions.invoke("tech-login", {
      body: { phone, pin },
    });
    if (login?.ok) {
      await supabase.auth.setSession({
        access_token: login.access_token,
        refresh_token: login.refresh_token,
      });
    }
    setBusy(false);
    toast.success("Account created — waiting for admin approval.");
    nav("/pending", { replace: true });
  };

  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-background px-5 py-10 pwa-pt-safe pwa-pb-safe">
      <div className="pointer-events-none absolute inset-0 gradient-primary opacity-[0.06]" />
      <div className="relative w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <img
            src={logo317}
            alt="317 Garage Door"
            className="mb-5 h-28 w-auto sm:h-32 drop-shadow-xl"
          />
          <div className="flex items-center gap-3">
            <span className="h-px w-8 bg-border" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground sm:text-xs">
              Weekly Balance Report System
            </p>
            <span className="h-px w-8 bg-border" />
          </div>
        </div>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="font-display text-2xl">Sign in to continue</CardTitle>
            <CardDescription>Manage and review weekly job balances.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="tech" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="tech">Technician</TabsTrigger>
                <TabsTrigger value="staff">Admin / Staff</TabsTrigger>
              </TabsList>

              {/* ============== TECHNICIAN ============== */}
              <TabsContent value="tech" className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-2 rounded-md border p-1">
                  <button
                    type="button"
                    onClick={() => setTechMode("signin")}
                    className={`h-9 rounded text-sm font-medium transition ${
                      techMode === "signin"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    onClick={() => setTechMode("signup")}
                    className={`h-9 rounded text-sm font-medium transition ${
                      techMode === "signup"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    Create account
                  </button>
                </div>

                {techMode === "signin" ? (
                  <form onSubmit={onTechSignIn} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="ti-phone">Mobile phone</Label>
                      <Input
                        id="ti-phone"
                        name="phone"
                        type="tel"
                        inputMode="numeric"
                        required
                        autoComplete="tel"
                        placeholder="555-123-4567"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ti-pin">4-digit PIN</Label>
                      <Input
                        id="ti-pin"
                        name="pin"
                        inputMode="numeric"
                        pattern="\d{4}"
                        maxLength={4}
                        required
                        autoComplete="current-password"
                        placeholder="••••"
                      />
                    </div>
                    <Button type="submit" className="w-full" size="lg" disabled={busy}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
                    </Button>
                    <p className="text-center text-xs text-muted-foreground">
                      Forgot your PIN? Ask your admin to reset it.
                    </p>
                  </form>
                ) : (
                  <form onSubmit={onTechSignUp} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="su-name">Full name</Label>
                      <Input id="su-name" name="full_name" required maxLength={120} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="su-phone">Mobile phone</Label>
                      <Input
                        id="su-phone"
                        name="phone"
                        type="tel"
                        inputMode="numeric"
                        required
                        autoComplete="tel"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="su-pin">Create 4-digit PIN</Label>
                        <Input
                          id="su-pin"
                          name="pin"
                          inputMode="numeric"
                          pattern="\d{4}"
                          maxLength={4}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="su-pin2">Confirm PIN</Label>
                        <Input
                          id="su-pin2"
                          name="pin2"
                          inputMode="numeric"
                          pattern="\d{4}"
                          maxLength={4}
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="su-code">Company invite code</Label>
                      <Input
                        id="su-code"
                        name="invite_code"
                        required
                        autoComplete="off"
                        placeholder="Ask your manager"
                      />
                    </div>
                    <Button type="submit" className="w-full" size="lg" disabled={busy}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account"}
                    </Button>
                    <p className="text-center text-xs text-muted-foreground">
                      Your account will be reviewed by an admin before you can submit reports.
                    </p>
                  </form>
                )}
              </TabsContent>

              {/* ============== STAFF (email) ============== */}
              <TabsContent value="staff" className="mt-4">
                <form onSubmit={onStaffSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" name="email" type="email" required autoComplete="email" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      required
                      autoComplete="current-password"
                      minLength={6}
                    />
                  </div>
                  <Button type="submit" className="w-full" size="lg" disabled={busy}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    Email login is for admin, area managers, and office staff.
                  </p>
                </form>
              </TabsContent>
            </Tabs>

            <div className="mt-6 flex justify-center border-t pt-4">
              <InstallAppButton className="w-full" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
