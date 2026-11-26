import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { UserSettings } from "../lib/types";

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  company: string | null;
  current_organization_id: string | null;
}

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  settings: UserSettings | null;
  orgId: string | null;
  orgName: string | null;
  role: "owner" | "admin" | "member" | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [role, setRole] = useState<AuthState["role"]>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null); setSettings(null); setRole(null); setOrgName(null);
      return;
    }
    const [{ data: p }, { data: st }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", s.user.id).maybeSingle(),
      supabase.from("user_settings").select("*").eq("user_id", s.user.id).maybeSingle(),
    ]);
    setProfile(p as Profile | null);
    setSettings(st as UserSettings | null);
    if (p?.current_organization_id) {
      const [{ data: m }, { data: o }] = await Promise.all([
        supabase.from("organization_members").select("role").eq("organization_id", p.current_organization_id).eq("user_id", s.user.id).maybeSingle(),
        supabase.from("organizations").select("name").eq("id", p.current_organization_id).maybeSingle(),
      ]);
      setRole((m?.role as AuthState["role"]) ?? null);
      setOrgName(o?.name ?? null);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await load(data.session).catch(console.error);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      // adia a carga para fora do callback (recomendação do supabase-js)
      setTimeout(() => load(s).catch(console.error), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  const value: AuthState = {
    session,
    user: session?.user ?? null,
    profile,
    settings,
    orgId: profile?.current_organization_id ?? null,
    orgName,
    role,
    loading,
    refresh: () => load(session),
    signOut: async () => { await supabase.auth.signOut(); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth fora do AuthProvider");
  return v;
}
