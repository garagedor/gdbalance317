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
import { Wrench, Loader2 } from "lucide-react";

export default function Auth() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { session, profile, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const redirect = params.get("redirect") ?? null;

  if (!loading && session && profile) {
    const target = redirect ?? (profile.role === "management" ? "/admin" : "/tech");
    return <Navigate to={target} replace />;
  }

  const onSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Welcome back");
  };

  const onSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    const full_name = String(fd.get("full_name") ?? "").trim();
    const phone = String(fd.get("phone") ?? "").trim() || null;

    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { full_name, phone },
      },
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Account created — you're signed in");
  };

  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-background px-5 py-10">
      <div className="pointer-events-none absolute inset-0 gradient-primary opacity-[0.06]" />
      <div className="relative w-full max-w-md">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl gradient-accent shadow-glow">
            <Wrench className="h-5 w-5 text-accent-foreground" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight">Tally</h1>
            <p className="text-xs text-muted-foreground">Weekly Tech Balance</p>
          </div>
        </div>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="font-display text-2xl">Sign in to continue</CardTitle>
            <CardDescription>Manage and review weekly job balances.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Create account</TabsTrigger>
              </TabsList>
              <TabsContent value="signin" className="mt-4">
                <form onSubmit={onSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" name="email" type="email" required autoComplete="email" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input id="password" name="password" type="password" required autoComplete="current-password" minLength={6} />
                  </div>
                  <Button type="submit" className="w-full" size="lg" disabled={busy}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
                  </Button>
                </form>
              </TabsContent>
              <TabsContent value="signup" className="mt-4">
                <form onSubmit={onSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="su-name">Full name</Label>
                    <Input id="su-name" name="full_name" required maxLength={120} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="su-email">Email</Label>
                      <Input id="su-email" name="email" type="email" required autoComplete="email" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="su-phone">Phone</Label>
                      <Input id="su-phone" name="phone" type="tel" autoComplete="tel" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="su-pw">Password</Label>
                    <Input id="su-pw" name="password" type="password" required autoComplete="new-password" minLength={6} />
                  </div>
                  <Button type="submit" className="w-full" size="lg" disabled={busy}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account"}
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    New accounts default to the technician role. Contact management for elevated access.
                  </p>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
