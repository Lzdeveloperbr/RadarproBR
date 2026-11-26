// Autenticação nas Edge Functions: cliente Supabase com o JWT do usuário (RLS sempre aplicado).
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { HttpError, env } from "./http.ts";

export interface Ctx {
  sb: SupabaseClient;
  userId: string;
  orgId: string;
  role: "owner" | "admin" | "member";
}

export function serviceClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL")!, env("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
}

export async function requireUser(req: Request): Promise<Ctx> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) throw new HttpError(401, "Não autenticado");
  const sb = createClient(env("SUPABASE_URL")!, env("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: u, error } = await sb.auth.getUser(authHeader.slice(7));
  if (error || !u?.user) throw new HttpError(401, "Sessão inválida ou expirada");
  const { data: profile } = await sb.from("profiles").select("current_organization_id").eq("id", u.user.id).maybeSingle();
  let orgId = profile?.current_organization_id as string | undefined;
  const { data: members } = await sb.from("organization_members").select("organization_id, role").eq("user_id", u.user.id);
  const m = (members ?? []).find((x) => x.organization_id === orgId) ?? (members ?? [])[0];
  if (!m) throw new HttpError(403, "Usuário sem organização");
  orgId = m.organization_id;
  return { sb, userId: u.user.id, orgId: orgId!, role: m.role };
}
