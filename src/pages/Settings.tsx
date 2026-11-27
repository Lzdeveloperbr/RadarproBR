import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Settings, Save, Briefcase, Radar, Bell, ShieldCheck, Database, FlaskConical } from "lucide-react";
import { googleKey, tomtomKey } from "../lib/services";
import { tomtomPoiSearch } from "../lib/engine/tomtom";
import { googleTextSearch, gridCells } from "../lib/engine/google";
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
  const [testing, setTesting] = useState(false);
  const siteKey = !!import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY;
  const ttSiteKey = !!import.meta.env.VITE_TOMTOM_API_KEY;
  const testGoogle = async () => {
    const key = googleKey(s.google_api_key);
    if (!key) return toast.error("Informe uma chave do Google primeiro");
    setTesting(true);
    try {
      const r = await googleTextSearch(key, "padaria em São Paulo", gridCells(-23.55, -46.63, 2, 1)[0]);
      toast.success(`Google Places funcionando: ${r.length} resultados no teste`);
    } catch (e: any) { toast.error(e.message, { duration: 10000 }); } finally { setTesting(false); }
  };
  const testTomTom = async () => {
    const key = tomtomKey(s.tomtom_api_key);
    if (!key) return toast.error("Informe a chave da TomTom primeiro");
    setTesting(true);
    try {
      const r = await tomtomPoiSearch(key, "padaria", -23.55, -46.63, 2000, 10);
      toast.success(`TomTom funcionando: ${r.length} resultados no teste`);
    } catch (e: any) { toast.error(e.message, { duration: 10000 }); } finally { setTesting(false); }
  };
  const save = async () => {
    setSaving(true);
    try {
      const keyChanged = (s.google_api_key ?? null) !== (settings.google_api_key ?? null);
      await persist({ ...s, onboarded: true });
      toast.success(keyChanged && (globalThis as any).google?.maps ? "Salvo. Recarregue a página para usar a nova chave do Google." : "Configurações salvas");
    }
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
        <Card className="xl:col-span-2">
          <CardHeader title="Fontes de dados" icon={Database} subtitle={`Ativas: ${["OpenStreetMap", tomtomKey(s.tomtom_api_key) && "TomTom", googleKey(s.google_api_key) && "Google"].filter(Boolean).join(" + ")}`} />
          <div className="grid gap-4 px-5 pb-5 lg:grid-cols-2">
            <div className="space-y-3">
              <Field label="Fonte das pesquisas">
                <select className="input" value={s.search_source} onChange={(e) => set({ search_source: e.target.value as UserSettings["search_source"] })}>
                  <option value="auto">Automático — todas as fontes configuradas juntas</option>
                  <option value="tomtom">Somente TomTom</option>
                  <option value="google">Somente Google Places</option>
                  <option value="osm">Somente OpenStreetMap (gratuito)</option>
                </select>
              </Field>
              <Field label={ttSiteKey ? "Chave da TomTom (opcional — o site já tem uma)" : "Chave da TomTom — gratuita, sem cartão (recomendado)"} hint="Crie grátis em developer.tomtom.com. Fica salva só neste navegador.">
                <input className="input font-mono" type="password" autoComplete="off" placeholder="Chave da TomTom" value={s.tomtom_api_key ?? ""} onChange={(e) => set({ tomtom_api_key: e.target.value.trim() || null })} />
              </Field>
              <Button variant="secondary" icon={FlaskConical} loading={testing} onClick={testTomTom}>Testar TomTom</Button>
              <Field label={siteKey ? "Chave do Google (opcional — o site já tem uma)" : "Chave do Google (Maps JavaScript API + Places API New)"} hint="Fica salva só neste navegador. Use uma chave restrita ao domínio do site.">
                <input className="input font-mono" type="password" autoComplete="off" placeholder="AIza..." value={s.google_api_key ?? ""} onChange={(e) => set({ google_api_key: e.target.value.trim() || null })} />
              </Field>
              <Field label={`Cobertura do Google por categoria: até ${s.google_max_grid * s.google_max_grid} consultas (${s.google_max_grid * s.google_max_grid * 20} resultados)`} hint="Mais cobertura = mais consultas à sua cota do Google.">
                <input type="range" min={1} max={5} className="w-full accent-lime-400" value={s.google_max_grid} onChange={(e) => set({ google_max_grid: Number(e.target.value) })} />
              </Field>
              <Button variant="secondary" icon={FlaskConical} loading={testing} onClick={testGoogle}>Testar Google</Button>
            </div>
            <div className="rounded-xl bg-ink-950/60 border border-white/5 p-4 text-xs text-ink-300 space-y-1.5">
              <div className="text-white font-medium text-sm">TomTom (grátis, sem cartão)</div>
              <p>1. Crie uma conta em <a className="text-lime-400 hover:underline" href="https://developer.tomtom.com/" target="_blank" rel="noreferrer">developer.tomtom.com</a>.</p>
              <p>2. No painel, copie a chave (API Key) criada automaticamente — ela já inclui a Search API.</p>
              <p>3. Cole aqui e clique em Testar TomTom. Ao passar do limite gratuito, a TomTom bloqueia as consultas em vez de cobrar.</p>
              <div className="text-white font-medium text-sm pt-3">Google (opcional, exige cartão)</div>
              <p>1. Acesse <a className="text-lime-400 hover:underline" href="https://console.cloud.google.com/" target="_blank" rel="noreferrer">console.cloud.google.com</a>, crie um projeto e ative o faturamento (o Google pede cartão, mas oferece uso gratuito mensal).</p>
              <p>2. Em <b>APIs e serviços → Biblioteca</b>, ative <b>Maps JavaScript API</b> e <b>Places API (New)</b>.</p>
              <p>3. Em <b>Credenciais → Criar credenciais → Chave de API</b>. Em restrições: <b>Sites</b> → adicione <code className="text-lime-400">{location.origin}/*</code>; em APIs → só as duas acima.</p>
              <p>4. Em <b>Cotas</b>, defina um limite diário de solicitações para nunca passar do uso gratuito.</p>
              <p>5. Cole a chave aqui e clique em Testar. Para valer para todos que abrirem o site, cadastre-a como variável <code className="text-lime-400">VITE_GOOGLE_MAPS_BROWSER_KEY</code> no GitHub (veja o README).</p>
            </div>
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
