import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldCheck, UserPlus, Users, Activity, Gauge, Building2 } from "lucide-react";
import { supabase, appUrl } from "../lib/supabase";
import { callFunction, errorMessage } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, PageLoader } from "../components/ui";
import { fmtDateTime } from "../lib/format";

export function AdminPage() {
  const { orgId, role, orgName, refresh, user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = role === "owner" || role === "admin";
  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState<"member" | "admin">("member");
  const [name, setName] = useState(orgName ?? "");
  const [busy, setBusy] = useState(false);

  const q = useQuery({
    queryKey: ["admin", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const [members, logs, usage, orgs] = await Promise.all([
        supabase.from("organization_members").select("user_id, role, created_at").eq("organization_id", orgId!),
        supabase.from("activity_logs").select("*").eq("organization_id", orgId!).order("created_at", { ascending: false }).limit(100),
        supabase.from("api_usage").select("provider, units, success, created_at").eq("organization_id", orgId!).gte("created_at", new Date(Date.now() - 30 * 86400_000).toISOString()).limit(50000),
        supabase.from("organization_members").select("organization_id, role, organizations(name)").eq("user_id", user!.id),
      ]);
      const ids = (members.data ?? []).map((m) => m.user_id);
      const { data: profiles } = await supabase.from("profiles").select("id, full_name, email").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      const byProvider: Record<string, { ok: number; fail: number }> = {};
      for (const u of usage.data ?? []) { byProvider[u.provider] ??= { ok: 0, fail: 0 }; byProvider[u.provider][u.success ? "ok" : "fail"] += u.units; }
      return { members: (members.data ?? []).map((m) => ({ ...m, profile: profiles?.find((p) => p.id === m.user_id) })), logs: logs.data ?? [], byProvider, orgs: orgs.data ?? [] };
    },
  });

  const act = async (body: any, msg: string) => {
    setBusy(true);
    try { await callFunction("admin-members", { ...body, redirect_to: appUrl() }); toast.success(msg); qc.invalidateQueries({ queryKey: ["admin"] }); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  const rename = async () => {
    const { error } = await supabase.from("organizations").update({ name }).eq("id", orgId!);
    if (error) return toast.error(error.message);
    toast.success("Organização atualizada"); refresh();
  };
  const switchOrg = async (id: string) => {
    const { error } = await supabase.from("profiles").update({ current_organization_id: id }).eq("id", user!.id);
    if (error) return toast.error(error.message);
    await refresh(); qc.invalidateQueries(); toast.success("Organização alterada");
  };

  if (q.isLoading || !q.data) return <PageLoader />;
  return (
    <>
      <PageHeader title="Administração" subtitle={`${orgName} · seu papel: ${role === "owner" ? "proprietário" : role === "admin" ? "administrador" : "membro"}`} icon={ShieldCheck} />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Organização" icon={Building2} />
          <div className="px-5 pb-5 space-y-3">
            <div className="flex gap-2"><input className="input" value={name} onChange={(e) => setName(e.target.value)} disabled={!isAdmin} /><Button variant="secondary" disabled={!isAdmin} onClick={rename}>Salvar</Button></div>
            {q.data.orgs.length > 1 && (
              <div>
                <div className="label">Trocar de organização</div>
                <div className="flex flex-wrap gap-1.5">{q.data.orgs.map((o: any) => <button key={o.organization_id} onClick={() => switchOrg(o.organization_id)} className={`chip ${o.organization_id === orgId ? "chip-active" : ""}`}>{o.organizations?.name}</button>)}</div>
              </div>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Consumo de APIs (30 dias)" icon={Gauge} />
          <div className="px-5 pb-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Object.entries(q.data.byProvider).map(([k, v]) => (
              <div key={k} className="rounded-xl bg-white/[0.03] p-3"><div className="text-[11px] text-ink-400">{k}</div><div className="heading text-lg text-white">{v.ok}</div>{v.fail > 0 && <div className="text-[11px] text-rose-300">{v.fail} falhas</div>}</div>
            ))}
            {!Object.keys(q.data.byProvider).length && <p className="text-sm text-ink-400 col-span-3">Sem consumo registrado.</p>}
          </div>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Membros e permissões" icon={Users} />
          <div className="px-5 pb-5 space-y-4">
            {isAdmin && (
              <div className="flex flex-col gap-2 sm:flex-row">
                <input className="input" type="email" placeholder="email@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                <select className="input sm:w-40" value={newRole} onChange={(e) => setNewRole(e.target.value as any)}><option value="member">Membro</option><option value="admin">Administrador</option></select>
                <Button icon={UserPlus} loading={busy} onClick={() => email && act({ action: "invite", email, role: newRole }, "Convite enviado")}>Convidar</Button>
              </div>
            )}
            <div className="divide-y divide-white/[0.04]">
              {q.data.members.map((m: any) => (
                <div key={m.user_id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div><div className="text-sm text-white">{m.profile?.full_name ?? "—"}</div><div className="text-xs text-ink-400">{m.profile?.email} · desde {fmtDateTime(m.created_at)}</div></div>
                  <div className="flex items-center gap-2">
                    <Badge className={m.role === "owner" ? "border-lime-400/30 text-lime-400 bg-lime-400/10" : undefined}>{m.role === "owner" ? "Proprietário" : m.role === "admin" ? "Administrador" : "Membro"}</Badge>
                    {isAdmin && m.role !== "owner" && m.user_id !== user!.id && (<>
                      <Button size="sm" variant="ghost" onClick={() => act({ action: "set_role", user_id: m.user_id, role: m.role === "admin" ? "member" : "admin" }, "Papel alterado")}>{m.role === "admin" ? "Tornar membro" : "Tornar admin"}</Button>
                      <Button size="sm" variant="danger" onClick={() => confirm("Remover este membro?") && act({ action: "remove", user_id: m.user_id }, "Membro removido")}>Remover</Button>
                    </>)}
                  </div>
                </div>
              ))}
            </div>
            {!isAdmin && <p className="text-xs text-ink-400">Apenas administradores podem convidar ou alterar membros.</p>}
          </div>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Logs de atividade e erros" icon={Activity} />
          {!q.data.logs.length ? <EmptyState title="Sem registros" /> : (
            <div className="px-5 pb-5 max-h-[480px] overflow-y-auto divide-y divide-white/[0.04]">
              {q.data.logs.map((l: any) => (
                <div key={l.id} className="flex items-start justify-between gap-3 py-2 text-xs">
                  <div className="min-w-0">
                    <Badge className={l.level === "error" ? "border-rose-400/30 text-rose-300 bg-rose-400/10" : l.level === "alert" ? "border-lime-400/30 text-lime-400 bg-lime-400/10" : undefined}>{l.level}</Badge>
                    <span className="ml-2 text-ink-100">{l.action}</span>
                    <div className="text-ink-500 truncate">{JSON.stringify(l.details)}</div>
                  </div>
                  <span className="text-ink-500 whitespace-nowrap">{fmtDateTime(l.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
