import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, ExternalLink, Copy, Plus, Trash2, Save, Rocket } from "lucide-react";
import { Button, Card, CardHeader, Field } from "../ui";
import { buildDemoSite, demoDefaults, type DemoInput } from "../../lib/demoSite";
import { copyText } from "../../lib/format";
import { db, uid, nowIso } from "../../lib/db";
import type { Business } from "../../lib/types";

export function DemoSiteBuilder({ business, whatsapp, instagram }: { business: Business; whatsapp?: string | null; instagram?: string | null }) {
  const [d, setD] = useState<DemoInput>(() => demoDefaults(business, whatsapp, instagram));
  const html = useMemo(() => buildDemoSite(d), [d]);
  const set = (patch: Partial<DemoInput>) => setD({ ...d, ...patch });
  const fileName = `site-${business.name.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}.html`;
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    a.download = fileName;
    a.click();
    toast.success("Site baixado — envie para o cliente ou publique de graça");
  };
  const openTab = () => window.open(URL.createObjectURL(new Blob([html], { type: "text/html" })), "_blank");
  const save = async () => {
    await db.prompts.add({ id: uid(), business_id: business.id, kind: "demo_site", title: `Site demonstração — ${business.name}`, content: html, created_at: nowIso() });
    toast.success("Site demonstração salvo no histórico do estabelecimento");
  };
  return (
    <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
      <Card>
        <CardHeader title="Conteúdo do site" icon={Rocket} subtitle="Dados verificados já preenchidos. Campos vazios não aparecem no site." />
        <div className="px-5 pb-5 space-y-3">
          <Field label="Frase de destaque"><input className="input" value={d.tagline} onChange={(e) => set({ tagline: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Cor principal"><input type="color" className="input h-10 p-1" value={d.color} onChange={(e) => set({ color: e.target.value })} /></Field>
            <Field label="Texto do botão"><input className="input" value={d.ctaLabel} onChange={(e) => set({ ctaLabel: e.target.value })} /></Field>
          </div>
          <Field label="WhatsApp (só números)"><input className="input" value={d.whatsapp} onChange={(e) => set({ whatsapp: e.target.value })} /></Field>
          <Field label="Instagram (link ou @usuario)"><input className="input" value={d.instagram} onChange={(e) => set({ instagram: e.target.value })} /></Field>
          <Field label="Imagem de capa (link, opcional)" hint="Use uma foto real do estabelecimento com autorização."><input className="input" placeholder="https://..." value={d.heroImage} onChange={(e) => set({ heroImage: e.target.value })} /></Field>
          <Field label="Sobre a empresa (preencha com o cliente)"><textarea className="input min-h-20" value={d.about} onChange={(e) => set({ about: e.target.value })} /></Field>
          <div>
            <div className="label">Serviços / produtos (confirme com o cliente — nada é inventado)</div>
            {d.services.map((s, i) => (
              <div key={i} className="mb-2 grid grid-cols-[1fr_90px_auto] gap-1.5">
                <input className="input" placeholder="Nome" value={s.name} onChange={(e) => set({ services: d.services.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                <input className="input" placeholder="Preço" value={s.price} onChange={(e) => set({ services: d.services.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)) })} />
                <button onClick={() => set({ services: d.services.filter((_, j) => j !== i) })} className="px-2 text-ink-500 hover:text-rose-300" aria-label="Remover"><Trash2 className="size-4" /></button>
                <input className="input col-span-3" placeholder="Descrição curta (opcional)" value={s.desc} onChange={(e) => set({ services: d.services.map((x, j) => (j === i ? { ...x, desc: e.target.value } : x)) })} />
              </div>
            ))}
            <Button size="sm" variant="ghost" icon={Plus} onClick={() => set({ services: [...d.services, { name: "", price: "", desc: "" }] })}>Adicionar serviço</Button>
          </div>
          <Field label="Horário (um por linha)"><textarea className="input min-h-16" value={d.hours.join("\n")} onChange={(e) => set({ hours: e.target.value.split("\n").filter((x) => x.trim()) })} /></Field>
        </div>
      </Card>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button icon={Download} onClick={download}>Baixar site (.html)</Button>
          <Button variant="secondary" icon={ExternalLink} onClick={openTab}>Abrir em nova aba</Button>
          <Button variant="secondary" icon={Copy} onClick={async () => { await copyText(html); toast.success("Código copiado"); }}>Copiar código</Button>
          <Button variant="ghost" icon={Save} onClick={save}>Salvar</Button>
        </div>
        <div className="card overflow-hidden p-0">
          <iframe title="Prévia do site" srcDoc={html} sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" className="h-[70vh] w-full bg-white" />
        </div>
        <Card className="p-4 text-xs text-ink-300 space-y-1">
          <div className="text-sm font-medium text-white">Publicar grátis em 1 minuto</div>
          <p>1. Baixe o arquivo .html. 2. Acesse <a className="text-lime-400 hover:underline" href="https://app.netlify.com/drop" target="_blank" rel="noreferrer">app.netlify.com/drop</a> e arraste o arquivo (renomeie para index.html). 3. Envie o link ao cliente como demonstração.</p>
          <p>O mapa usa o Google Maps incorporado (gratuito) e o botão de WhatsApp abre a conversa com mensagem pronta.</p>
        </Card>
      </div>
    </div>
  );
}
