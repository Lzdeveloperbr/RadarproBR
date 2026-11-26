import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Settings, Save, UserCircle, Briefcase, Radar, Bell, ShieldCheck, Trash2 } from "lucide-react";
import { supabase, isRuntimeConfigured, clearRuntimeConfig } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import { Button, Card, CardHeader, Field, PageHeader, Toggle } from "../components/ui";
import { UFS } from "../lib/constants";
import type { UserSettings } from "../lib/types";

export function SettingsPage() {
  const { settings, user, refresh } = useAuth();
  const [s, setS] = useState<Partial<UserSettings>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (settings) setS(settings); }, [settings]);
  const set = (patch: Partial<UserSettings>) => setS({ ...s, ...patch });
  const save = async () => {
    setSaving(true);
    const { user_id: _u, ...rest } = s as UserSettings;
    const { error } = await supabase.from("user_settings").update({ ...rest, updated_at: new Date().toISOString() }).eq("user_id", user!.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Configurações salvas");
    refresh();
  };
  return (
    <>
      <PageHeader title="Configurações" subtitle="Preferências de pesquisa, dados do vendedor e alertas" icon={Settings} actions={<Button icon={Save} loading={saving} onClick={save}>Salvar</Button>} />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Dados do vendedor" subtitle="Usados nas propostas e mensagens" icon={Briefcase} />
          <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2">
            <Field label="Nome"><input className="input" value={s.seller_name ?? ""} onChange={(e) => set({ seller_name: e.target.value })} /></Field>
            <Field label="Empresa"><input className="input" value={s.seller_company ?? ""} onChange={(e) => set({ seller_company: e.target.value })} /></Field>
            <Field label="E-mail"><input className="input" type="email" value={s.seller_email ?? ""} onChange={(e) => set({ seller_email: e.target.value })} /></Field>
            <Field label="Telefone"><input className="input" value={s.seller_phone ?? ""} onChange={(e) => set({ seller_phone: e.target.value })} /></Field>
            <Field label="WhatsApp"><input className="input" value={s.seller_whatsapp ?? ""} onChange={(e) => set({ seller_whatsapp: e.target.value })} /></Field>
            <Field label="Site"><input className="input" value={s.seller_website ?? ""} onChange={(e) => set({ seller_website: e.target.value })} /></Field>
            <div className="sm:col-span-2"><Field label="Rodapé das propostas"><textarea className="input min-h-16" value={s.proposal_footer ?? ""} onChange={(e) => set({ proposal_footer: e.target.value })} /></Field></div>
            <Field label="Validade padrão das propostas (dias)"><input type="number" className="input" value={s.proposal_validity_days ?? 15} onChange={(e) => set({ proposal_validity_days: Number(e.target.value) || 15 })} /></Field>
          </div>
        </Card>
        <Card>
          <CardHeader title="Padrões de pesquisa" icon={Radar} />
          <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2">
            <Field label="País"><input className="input" value={s.default_country ?? "Brasil"} onChange={(e) => set({ default_country: e.target.value })} /></Field>
            <Field label="Estado"><select className="input" value={s.default_state ?? ""} onChange={(e) => set({ default_state: e.target.value || null })}><option value="">—</option>{UFS.map(([uf, n]) => <option key={uf} value={uf}>{n}</option>)}</select></Field>
            <Field label="Cidade"><input className="input" value={s.default_city ?? ""} onChange={(e) => set({ default_city: e.target.value || null })} /></Field>
            <Field label="Raio padrão (km)"><input type="number" min={1} max={100} className="input" value={s.default_radius_km ?? 10} onChange={(e) => set({ default_radius_km: Math.min(100, Math.max(1, Number(e.target.value) || 10)) })} /></Field>
            <Field label="Máximo de resultados"><input type="number" min={1} max={300} className="input" value={s.default_max_results ?? 60} onChange={(e) => set({ default_max_results: Math.min(300, Math.max(1, Number(e.target.value) || 60)) })} /></Field>
            <div className="sm:col-span-2 space-y-3 pt-1">
              <Toggle checked={!!s.auto_audit} onChange={(v) => set({ auto_audit: v })} label="Analisar presença digital automaticamente após cada pesquisa" />
              <Toggle checked={!!s.use_web_search} onChange={(v) => set({ use_web_search: v })} label="Usar pesquisa na web para localizar sites não informados no Google" />
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader title="Alertas de oportunidades" icon={Bell} />
          <div className="px-5 pb-5">
            <Field label={`Gerar alerta quando a pontuação for ≥ ${s.alert_min_score ?? 70}`}>
              <input type="range" min={0} max={100} className="w-full accent-lime-400" value={s.alert_min_score ?? 70} onChange={(e) => set({ alert_min_score: Number(e.target.value) })} />
            </Field>
            <p className="text-xs text-ink-400">Alertas aparecem nas atividades recentes do dashboard.</p>
          </div>
        </Card>
        <Card>
          <CardHeader title="Privacidade e LGPD" icon={ShieldCheck} />
          <div className="px-5 pb-5 text-xs text-ink-300 space-y-2">
            <p>O RADAR LOCAL PRO coleta apenas dados comerciais públicos de estabelecimentos (nome, endereço, telefone comercial, site e redes sociais públicas), obtidos de fontes permitidas: Google Places API, serviços de busca licenciados e páginas públicas que autorizam acesso automatizado via robots.txt.</p>
            <p>Não coletamos dados pessoais sensíveis. Os dados da sua organização são isolados por Row Level Security e só podem ser vistos pelos membros da organização.</p>
            <p>Para atender a um pedido de exclusão, abra a ficha do estabelecimento e use “Excluir da base”: todos os dados relacionados são removidos.</p>
          </div>
        </Card>
      </div>
    </>
  );
}

export function ProfilePage() {
  const { profile, user, refresh, signOut } = useAuth();
  const [p, setP] = useState({ full_name: "", phone: "", company: "" });
  const [pwd, setPwd] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (profile) setP({ full_name: profile.full_name ?? "", phone: profile.phone ?? "", company: profile.company ?? "" }); }, [profile]);
  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("profiles").update(p).eq("id", user!.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Perfil atualizado");
    refresh();
  };
  const changePwd = async () => {
    if (pwd.length < 8) return toast.error("Mínimo de 8 caracteres");
    const { error } = await supabase.auth.updateUser({ password: pwd });
    if (error) return toast.error(error.message);
    setPwd("");
    toast.success("Senha alterada");
  };
  const exportMine = async () => {
    const [{ data: prof }, { data: st }] = await Promise.all([supabase.from("profiles").select("*").eq("id", user!.id).single(), supabase.from("user_settings").select("*").eq("user_id", user!.id).single()]);
    const blob = new Blob([JSON.stringify({ profile: prof, settings: st, email: user!.email }, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "meus-dados-radar.json"; a.click();
  };
  return (
    <>
      <PageHeader title="Perfil" subtitle={user?.email ?? ""} icon={UserCircle} />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-5 space-y-3">
          <Field label="Nome completo"><input className="input" value={p.full_name} onChange={(e) => setP({ ...p, full_name: e.target.value })} /></Field>
          <Field label="Telefone"><input className="input" value={p.phone} onChange={(e) => setP({ ...p, phone: e.target.value })} /></Field>
          <Field label="Empresa"><input className="input" value={p.company} onChange={(e) => setP({ ...p, company: e.target.value })} /></Field>
          <Button icon={Save} loading={saving} onClick={save}>Salvar perfil</Button>
        </Card>
        <Card className="p-5 space-y-3">
          <Field label="Nova senha"><input type="password" className="input" value={pwd} onChange={(e) => setPwd(e.target.value)} autoComplete="new-password" /></Field>
          <Button variant="secondary" onClick={changePwd}>Alterar senha</Button>
          <div className="border-t border-white/[0.06] pt-4 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={exportMine}>Exportar meus dados (LGPD)</Button>
            <Button variant="danger" icon={Trash2} onClick={signOut}>Sair da conta</Button>
            {isRuntimeConfigured && <Button variant="ghost" onClick={async () => { if (!confirm("Desconectar este navegador do banco de dados?")) return; await signOut(); clearRuntimeConfig(); location.reload(); }}>Trocar banco de dados</Button>}
          </div>
        </Card>
      </div>
    </>
  );
}
