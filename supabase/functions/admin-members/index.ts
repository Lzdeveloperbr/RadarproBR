// Administração da organização: convidar membros (via Supabase Auth Admin), alterar papel e remover.
import { handler, json, readJson, HttpError, env } from "../_shared/http.ts";
import { requireUser, serviceClient } from "../_shared/auth.ts";
import { logActivity } from "../_shared/usage.ts";

Deno.serve(handler(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "Método não permitido");
  const ctx = await requireUser(req);
  if (ctx.role !== "owner" && ctx.role !== "admin") throw new HttpError(403, "Apenas administradores podem gerenciar membros");
  const body = await readJson<{ action: "invite" | "set_role" | "remove"; email?: string; user_id?: string; role?: "admin" | "member"; redirect_to?: string }>(req);
  const admin = serviceClient();

  if (body.action === "invite") {
    const email = (body.email ?? "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(email)) throw new HttpError(400, "E-mail inválido");
    const role = body.role === "admin" ? "admin" : "member";
    // Usuário já existe? Apenas vincula.
    const { data: existing } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
    if (existing) {
      const { error } = await admin.from("organization_members").upsert({ organization_id: ctx.orgId, user_id: existing.id, role }, { onConflict: "organization_id,user_id" });
      if (error) throw new HttpError(500, error.message);
      await logActivity(ctx, "member.added", { type: "user", id: existing.id }, { email, role });
      return json(req, { ok: true, status: "added" });
    }
    const redirectTo = body.redirect_to && /^https?:\/\//.test(body.redirect_to) ? body.redirect_to : env("SITE_URL");
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { data: { invited_org: ctx.orgId, invited_role: role }, redirectTo });
    if (error) throw new HttpError(400, "Falha ao enviar convite: " + error.message);
    await logActivity(ctx, "member.invited", { type: "user", id: data.user?.id }, { email, role });
    return json(req, { ok: true, status: "invited" });
  }

  if (!body.user_id || !/^[0-9a-f-]{36}$/i.test(body.user_id)) throw new HttpError(400, "user_id inválido");
  const { data: target } = await admin.from("organization_members").select("role").eq("organization_id", ctx.orgId).eq("user_id", body.user_id).maybeSingle();
  if (!target) throw new HttpError(404, "Membro não encontrado");
  if (target.role === "owner") throw new HttpError(403, "O proprietário não pode ser alterado");

  if (body.action === "set_role") {
    const role = body.role === "admin" ? "admin" : "member";
    const { error } = await admin.from("organization_members").update({ role }).eq("organization_id", ctx.orgId).eq("user_id", body.user_id);
    if (error) throw new HttpError(500, error.message);
    await logActivity(ctx, "member.role_changed", { type: "user", id: body.user_id }, { role });
    return json(req, { ok: true });
  }
  if (body.action === "remove") {
    const { error } = await admin.from("organization_members").delete().eq("organization_id", ctx.orgId).eq("user_id", body.user_id);
    if (error) throw new HttpError(500, error.message);
    await logActivity(ctx, "member.removed", { type: "user", id: body.user_id });
    return json(req, { ok: true });
  }
  throw new HttpError(400, "Ação inválida");
}));
