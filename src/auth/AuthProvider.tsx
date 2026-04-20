import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Role = "technician" | "management";
export interface Profile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: Role;
  area_id: string | null;
  is_active: boolean;
}

interface AuthCtx {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from("users")
      .select("id, full_name, email, phone, role, area_id, is_active")
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      console.error("Failed to load profile", error);
      setProfile(null);
      return;
    }
    setProfile((data as Profile) ?? null);
  };

  useEffect(() => {
    // 1) Subscribe FIRST to avoid missing the initial event.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        // Defer profile fetch to avoid deadlocks inside the auth callback.
        setTimeout(() => loadProfile(s.user.id), 0);
      } else {
        setProfile(null);
      }
    });

    // 2) Then read existing session.
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) loadProfile(data.session.user.id).finally(() => setLoading(false));
      else setLoading(false);
    });

    return () => { sub.subscription.unsubscribe(); };
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      signOut: async () => {
        await supabase.auth.signOut();
      },
      refreshProfile: async () => {
        if (session?.user) await loadProfile(session.user.id);
      },
    }),
    [session, profile, loading]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
