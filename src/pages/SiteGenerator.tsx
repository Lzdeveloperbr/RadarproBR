import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Rocket, Wand2, Copy, Save, Smartphone, Globe, ExternalLink } from "lucide-react";
import { db, uid, nowIso } from "../lib/db";
const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
import { buildLovablePrompt } from "../lib/sitePrompt";
import type { Business } from "../lib/types";
import { Button, Card, CardHeader, EmptyState, PageHeader, Tabs } from "../components/ui";
import { BusinessPicker } from "../components/BusinessPicker";
import { DemoSiteBuilder } from "../components/business/DemoSiteBuilder";
import { copyText } from "../lib/format";

export function SiteGeneratorPage() {
  const [sp, setSp] = useSearchParams();
  const businessId = sp.get("business");
  const [kind, setKind] = useState<"site" | "app" | "demo">(sp.get("kind") === "app" ? "app" : sp.get("kind") === "demo" ? "demo" : "site");
  const [text, setText] = useState("");

  const data = useQuery({
    queryKey: ["generator", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const b = await db.businesses.get(businessId!);
      if (!b) throw new Error("Estabelecimento não encontrado");
      return { b: b as Business, contacts: await db.contacts.where("business_id").equals(businessId!).toArray(), opp: (await db.opportunities.get(businessId!)) ?? null };
    },
  });

  useEffect(() => {
    if (!data.data) return;
    const { b, contacts, opp } = data.data;
    const get = (t: string) => contacts.find((x: any) => x.type === t);
    setText(buildLovablePrompt({
      business: b,
      whatsapp: get("whatsapp")?.value,
      instagram: get("instagram")?.url,
      facebook: get("facebook")?.url,
      email: get("email")?.value,
      reasons: (opp?.reasons ?? []).filter((r: any) => r.kind === "fact" && r.weight > 0).map((r: any) => r.text),
      products: opp?.suggested_products,
    }, kind === "app" ? "app" : "site"));
  }, [data.data, kind]);

  const save = async () => {
    await db.prompts.add({ id: uid(), business_id: businessId, kind: kind === "app" ? "app" : "lovable_site", title: `${kind === "app" ? "Prompt de aplicativo" : "Prompt Lovable"} — ${data.data?.b.name}`, content: text, created_at: nowIso() });
    toast.success("Prompt salvo no histórico do estabelecimento");
  };
  const placeholders = (text.match(/\[A PREENCHER[^\]]*\]/g) ?? []).length;

  return (
    <>
      <PageHeader title="Gerador de sites e aplicativos" subtitle="Prompt para o Lovable ou um site demonstração pronto para mostrar ao cliente" icon={Wand2} />
      <Card className="p-4 mb-4"><BusinessPicker onPick={(id) => setSp({ business: id, kind })} /></Card>
      {!businessId ? (
        <Card><EmptyState icon={Wand2} title="Selecione um estabelecimento" description="Busque acima ou abra a ficha de um estabelecimento e clique em “Gerar site personalizado”." /></Card>
      ) : data.isLoading ? null : data.error ? <Card><EmptyState title="Erro" description={errorMessage(data.error)} /></Card> : kind === "demo" ? (
        <>
          <div className="mb-4"><Tabs value={kind} onChange={(k) => { setKind(k); setSp({ business: businessId, kind: k }); }} tabs={[{ key: "site", label: "Prompt de site", icon: Globe }, { key: "app", label: "Prompt de aplicativo", icon: Smartphone }, { key: "demo", label: "Site demonstração", icon: Rocket }]} /></div>
          <DemoSiteBuilder business={data.data!.b} whatsapp={data.data!.contacts.find((c: any) => c.type === "whatsapp")?.value} instagram={data.data!.contacts.find((c: any) => c.type === "instagram")?.url} />
        </>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
          <Card>
            <CardHeader title={data.data!.b.name} subtitle={`${data.data!.b.category ?? ""} · ${data.data!.b.city ?? ""}`} icon={kind === "app" ? Smartphone : Globe}
              action={<Tabs value={kind} onChange={(k) => { setKind(k); setSp({ business: businessId, kind: k }); }} tabs={[{ key: "site", label: "Site", icon: Globe }, { key: "app", label: "App", icon: Smartphone }, { key: "demo", label: "Demonstração", icon: Rocket }]} />} />
            <div className="px-5 pb-5">
              <textarea className="input min-h-[60vh] font-mono text-[12.5px] leading-relaxed" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
              <div className="mt-3 flex flex-wrap gap-2">
                <Button icon={Copy} onClick={async () => { await copyText(text); toast.success("Prompt copiado!"); }}>COPIAR PROMPT</Button>
                <Button variant="secondary" icon={Save} onClick={save}>Salvar</Button>
                <a href="https://lovable.dev" target="_blank" rel="noreferrer"><Button variant="ghost" icon={ExternalLink}>Abrir Lovable</Button></a>
              </div>
            </div>
          </Card>
          <div className="space-y-4">
            <Card className="p-5 text-sm">
              <div className="heading font-semibold text-white mb-2">Campos a preencher</div>
              <p className="text-ink-300"><span className="heading text-3xl text-lime-400">{placeholders}</span> campos marcados como <code className="text-amber-300">[A PREENCHER]</code>.</p>
              <p className="mt-2 text-xs text-ink-400">Preços, serviços, fotos e textos institucionais nunca são inventados. Complete com o cliente antes de enviar ao Lovable.</p>
            </Card>
            <Card className="p-5 text-xs text-ink-300 space-y-1.5">
              <div className="heading font-semibold text-white text-sm mb-1">Estrutura do prompt</div>
              {["Design", "Estrutura", "Página inicial", "Serviços", "Preços", "Galeria", "Sobre a empresa", "Localização", "Google Maps", "Botão de WhatsApp", "Contato", "SEO", "Responsividade", "Animações", "Integrações"].map((s, i) => <div key={s}><span className="text-lime-400">{i + 1}.</span> {s}</div>)}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
