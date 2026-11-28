import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Radar, Zap, Wand2, Gauge } from "lucide-react";
import { useSettings } from "../../hooks/useSettings";
import { Button, Field, Modal } from "../ui";
import { UFS } from "../../lib/constants";
import { CityInput } from "../CityInput";

/** Boas-vindas no primeiro acesso: dados do vendedor e cidade padrão. */
export function Welcome() {
  const { settings, loading, save } = useSettings();
  const nav = useNavigate();
  const [f, setF] = useState({ seller_name: "", seller_company: "", seller_whatsapp: "", default_state: "", default_city: "" });
  if (loading || settings.onboarded) return null;
  const finish = async (go: boolean) => {
    await save({ ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim() || null])), onboarded: true });
    if (go) nav("/pesquisa");
  };
  return (
    <Modal open onClose={() => finish(false)} title="Bem-vindo ao RADAR LOCAL PRO"
      footer={<><Button variant="ghost" onClick={() => finish(false)}>Pular</Button><Button icon={Radar} onClick={() => finish(true)}>Começar a pesquisar</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 text-xs text-ink-300">
          {[[Radar, "Encontre comércios de qualquer cidade"], [Gauge, "Audite sites com o Google (grátis)"], [Zap, "Prospecte pelo WhatsApp em sequência"], [Wand2, "Gere propostas e sites demonstração"]].map(([I, t]: any) => (
            <div key={t} className="flex items-center gap-2 rounded-xl bg-white/[0.03] p-2.5"><I className="size-4 text-lime-400 shrink-0" />{t}</div>
          ))}
        </div>
        <p className="text-sm text-ink-300">Tudo gratuito e salvo neste navegador. Preencha seus dados para aparecerem nas mensagens e propostas (pode alterar depois em Configurações).</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Seu nome"><input className="input" value={f.seller_name} onChange={(e) => setF({ ...f, seller_name: e.target.value })} /></Field>
          <Field label="Sua empresa (opcional)"><input className="input" value={f.seller_company} onChange={(e) => setF({ ...f, seller_company: e.target.value })} /></Field>
          <Field label="Seu WhatsApp"><input className="input" value={f.seller_whatsapp} onChange={(e) => setF({ ...f, seller_whatsapp: e.target.value })} /></Field>
          <Field label="Estado onde vai prospectar"><select className="input" value={f.default_state} onChange={(e) => setF({ ...f, default_state: e.target.value })}><option value="">—</option>{UFS.map(([uf, n]) => <option key={uf} value={uf}>{n}</option>)}</select></Field>
          <div className="sm:col-span-2"><Field label="Cidade principal"><CityInput uf={f.default_state} value={f.default_city} onChange={(v) => setF({ ...f, default_city: v })} /></Field></div>
        </div>
      </div>
    </Modal>
  );
}
