import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Settings, Save, Briefcase, Radar, Bell, ShieldCheck } from "lucide-react";
import { useSettings } from "../hooks/useSettings";
import { Button, Card, CardHeader, Field, PageHeader, Toggle } from "../components/ui";
import { UFS } from "../lib/constants";
import type { UserSettings } from "../lib/types";

export function SettingsPage() {
  const { settings, save: persist } = useSettings();
  const [s, setS] = useState<UserSettings>(settings);
  const [saving, setSaving] = useState(false);
  useEffect(() => setS(settings), [settings]);
  const set = (patch: Partial<UserSettings>) => setS({ ...s, ...patch });
  const save = async () => {
    setSaving(true);
    try { await persist({ ...s, onboarded: true }); toast.success("Configurações salvas"); }
    catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };
  return (
    <>
      <PageHeader title="Configurações" subtitle="Seus dados de vendedor, preferências de pesquisa e alertas (salvos neste navegador)" icon={Settings} actions={<Button icon={Save} loading={saving} onClick={save}>Salvar</Button>} />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Seus dados de vendedor" subtitle="Aparecem nas propostas em PDF e nas mensagens" icon={Briefcase} />
          <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2">
            <Field label="Nome"><input className="input" value={s.seller_name ?? ""} onChange={(e) => set({ seller_name: e.target.value || null })} /></Field>
            <Field label="Empresa"><input className="input" value={s.seller_company ?? ""} onChange={(e) => set({ seller_company: e.target.value || null })} /></Field>
            <Field label="E-mail"><input className="input" type="email" value={s.seller_email ?? ""} onChange={(e) => set({ seller_email: e.target.value || null })} /></Field>
            <Field label="Telefone"><input className="input" value={s.seller_phone ?? ""} onChange={(e) => set({ seller_phone: e.target.value || null })} /></Field>
            <Field label="WhatsApp"><input className="input" value={s.seller_whatsapp ?? ""} onChange={(e) => set({ seller_whatsapp: e.target.value || null })} /></Field>
            <Field label="Site"><input className="input" value={s.seller_website ?? ""} onChange={(e) => set({ seller_website: e.target.value || null })} /></Field>
            <div className="sm:col-span-2"><Field label="Rodapé das propostas"><textarea className="input min-h-16" value={s.proposal_footer ?? ""} onChange={(e) => set({ proposal_footer: e.target.value || null })} /></Field></div>
            <Field label="Validade padrão das propostas (dias)"><input type="number" className="input" value={s.proposal_validity_days} onChange={(e) => set({ proposal_validity_days: Number(e.target.value) || 15 })} /></Field>
          </div>
        </Card>
        <Card>
          <CardHeader title="Padrões de pesquisa" icon={Radar} />
          <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2">
            <Field label="Estado"><select className="input" value={s.default_state ?? ""} onChange={(e) => set({ default_state: e.target.value || null })}><option value="">—</option>{UFS.map(([uf, n]) => <option key={uf} value={uf}>{n}</option>)}</select></Field>
            <Field label="Cidade"><input className="input" value={s.default_city ?? ""} onChange={(e) => set({ default_city: e.target.value || null })} /></Field>
            <Field label="Raio padrão (km)"><input type="number" min={1} max={50} className="input" value={s.default_radius_km} onChange={(e) => set({ default_radius_km: Math.min(50, Math.max(1, Number(e.target.value) || 10)) })} /></Field>
            <Field label="Máximo de resultados"><input type="number" min={1} max={300} className="input" value={s.default_max_results} onChange={(e) => set({ default_max_results: Math.min(300, Math.max(1, Number(e.target.value) || 60)) })} /></Field>
            <div className="sm:col-span-2 pt-1"><Toggle checked={s.auto_audit} onChange={(v) => set({ auto_audit: v })} label="Analisar presença digital automaticamente após cada pesquisa" /></div>
          </div>
        </Card>
        <Card>
          <CardHeader title="Alertas de oportunidades" icon={Bell} />
          <div className="px-5 pb-5">
            <Field label={`Gerar alerta quando a pontuação for ≥ ${s.alert_min_score}`}>
              <input type="range" min={0} max={100} className="w-full accent-lime-400" value={s.alert_min_score} onChange={(e) => set({ alert_min_score: Number(e.target.value) })} />
            </Field>
            <p className="text-xs text-ink-400">Alertas aparecem nas atividades recentes do dashboard.</p>
          </div>
        </Card>
        <Card>
          <CardHeader title="Privacidade e LGPD" icon={ShieldCheck} />
          <div className="px-5 pb-5 text-xs text-ink-300 space-y-2">
            <p>O RADAR LOCAL PRO usa apenas dados comerciais públicos de estabelecimentos (nome, endereço, telefone comercial, site e redes sociais públicas) do OpenStreetMap.</p>
            <p>Nada é enviado para servidores do RADAR: tudo fica salvo neste navegador. Você pode exportar, importar ou apagar seus dados em <b>Dados e backup</b>.</p>
            <p>Para atender a um pedido de exclusão, abra a ficha do estabelecimento e use “Excluir da base”.</p>
          </div>
        </Card>
      </div>
    </>
  );
}
