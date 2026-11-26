import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plug, CheckCircle2, Map as MapFree, Clock, KeyRound, AlertTriangle, Gauge, RefreshCw, MapPinned, Search, Bot, FileDown, Database, Globe2, Map } from "lucide-react";
import { callFunction, errorMessage } from "../lib/api";
import { Badge, Button, Card, PageHeader, PageLoader, ProgressBar } from "../components/ui";
import { fmtNumber } from "../lib/format";

const STATE: Record<string, [string, string, any]> = {
  connected: ["Integração conectada", "border-lime-400/30 text-lime-400 bg-lime-400/10", CheckCircle2],
  configured: ["Chave configurada", "border-sky-400/30 text-sky-300 bg-sky-400/10", KeyRound],
  pending: ["Integração pendente", "border-white/10 text-ink-300 bg-white/5", Clock],
  auth_error: ["Erro de autenticação", "border-rose-400/30 text-rose-300 bg-rose-400/10", AlertTriangle],
  limit: ["Limite de utilização", "border-amber-300/30 text-amber-300 bg-amber-300/10", Gauge],
  error: ["Erro", "border-rose-400/30 text-rose-300 bg-rose-400/10", AlertTriangle],
};

const INFO: Record<string, { title: string; icon: any; desc: string; setup: string[] }> = {
  openstreetmap: { title: "OpenStreetMap (gratuito)", icon: MapFree, desc: "Pesquisa de estabelecimentos e geocodificação sem chave e sem custo (Overpass + Nominatim).", setup: [
    "Não requer chave. Usado automaticamente quando o Google não está configurado.",
    "Para forçar: supabase secrets set SEARCH_PROVIDER=osm"] },
  google_places: { title: "Google Places API (New) — opcional", icon: MapPinned, desc: "Pesquisa de estabelecimentos com avaliações (requer faturamento no Google Cloud).", setup: [
    "Google Cloud Console → crie um projeto e ative o faturamento.", "Ative \"Places API (New)\" e \"Geocoding API\".",
    "Crie uma chave de API restrita a essas APIs (sem restrição de referenciador, pois é usada no servidor).",
    "supabase secrets set GOOGLE_MAPS_API_KEY=SUA_CHAVE"] },
  google_geocoding: { title: "Google Geocoding API", icon: Globe2, desc: "Converte cidade/bairro em coordenadas e área do município.", setup: ["Usa a mesma chave GOOGLE_MAPS_API_KEY com a Geocoding API ativada."] },
  web_search: { title: "Pesquisa na web", icon: Search, desc: "Localiza sites que não constam no Google Places.", setup: [
    "Opção A — Brave Search API: crie uma chave em api-dashboard.search.brave.com e rode: supabase secrets set BRAVE_SEARCH_API_KEY=CHAVE",
    "Opção B — Google Programmable Search: crie um mecanismo (cx) e rode: supabase secrets set GOOGLE_CSE_API_KEY=CHAVE GOOGLE_CSE_CX=ID",
    "Sem esta integração, o status \"site não identificado\" se baseia apenas no Google Places."] },
  anthropic: { title: "Inteligência artificial (Claude)", icon: Bot, desc: "Relatórios, propostas, mensagens e prompts.", setup: [
    "Crie uma chave em console.anthropic.com.", "supabase secrets set ANTHROPIC_API_KEY=CHAVE", "Opcional: ANTHROPIC_MODEL (padrão claude-opus-5-5)."] },
  site_fetch: { title: "Análise de páginas públicas", icon: Globe2, desc: "Leitura de sites com proteção SSRF e respeito ao robots.txt.", setup: ["Nativa nas Edge Functions — não requer chave."] },
  supabase: { title: "Supabase", icon: Database, desc: "Banco, autenticação, RLS e Edge Functions.", setup: ["supabase db push", "supabase functions deploy"] },
};

export function IntegrationsPage() {
  const [test, setTest] = useState(false);
  const q = useQuery({ queryKey: ["integrations", test], queryFn: () => callFunction("integrations-status", undefined, { method: "GET", query: test ? { test: "1" } : {} }), retry: false });
  const mapsKey = !!import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY;
  return (
    <>
      <PageHeader title="Integrações" subtitle="Status real das conexões — nenhuma conexão é simulada" icon={Plug}
        actions={<Button icon={RefreshCw} loading={q.isFetching && test} onClick={() => { setTest(true); q.refetch(); }}>Testar conexões</Button>} />
      {q.isLoading ? <PageLoader label="Verificando integrações..." /> : q.error ? (
        <Card className="p-6">
          <div className="flex items-center gap-2 text-rose-300"><AlertTriangle className="size-5" />Não foi possível consultar as integrações</div>
          <p className="mt-2 text-sm text-ink-300">{errorMessage(q.error)}</p>
          <pre className="mt-4 rounded-xl bg-ink-950 p-4 text-xs text-ink-200 border border-white/5">supabase functions deploy integrations-status</pre>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {Object.entries(q.data.integrations as Record<string, any>).map(([k, v]) => {
            const info = INFO[k];
            const [label, cls, Icon] = STATE[v.state] ?? STATE.error;
            const u = v.usage;
            return (
              <Card key={k} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="grid size-10 place-items-center rounded-xl bg-white/[0.04] text-lime-400"><info.icon className="size-5" /></div>
                    <div><div className="heading font-semibold text-white">{info.title}</div><div className="text-xs text-ink-400">{info.desc}</div></div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge className={cls}><Icon className="size-3" />{label}</Badge>
                    {v.active && <Badge className="border-lime-400/40 text-lime-400 bg-lime-400/10">Fonte ativa</Badge>}
                  </div>
                </div>
                <p className="mt-3 text-xs text-ink-300">{v.message}{v.provider ? ` · provedor: ${v.provider}` : ""}{v.model ? ` · modelo: ${v.model}` : ""}</p>
                {u && (
                  <div className="mt-4 space-y-2">
                    <div className="flex justify-between text-[11px] text-ink-400"><span>Consumo 24h: <b className="text-ink-100">{fmtNumber(u.last24h)}</b> / {fmtNumber(u.limits.perDay)}</span><span>30 dias: {fmtNumber(u.last30d)} · erros: {u.errors30d}</span></div>
                    <ProgressBar value={(u.last24h / u.limits.perDay) * 100} />
                    <div className="text-[11px] text-ink-500">Limite: {u.limits.perMinute}/min · {u.limits.perDay}/dia (ajustável via LIMIT_*_PER_MINUTE / LIMIT_*_PER_DAY)</div>
                  </div>
                )}
                {v.state !== "connected" && k !== "openstreetmap" && (
                  <div className="mt-4 rounded-xl bg-ink-950/70 border border-white/5 p-3 text-xs text-ink-300 space-y-1">
                    <div className="text-white font-medium">Como configurar</div>
                    {info.setup.map((s) => <div key={s} className="font-mono text-[11px] break-words">• {s}</div>)}
                  </div>
                )}
              </Card>
            );
          })}
          <Card className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-white/[0.04] text-lime-400"><Map className="size-5" /></div>
                <div><div className="heading font-semibold text-white">Google Maps (mapa no navegador)</div><div className="text-xs text-ink-400">Mapa interativo com marcadores e agrupamento.</div></div></div>
              <Badge className={mapsKey ? STATE.configured[1] : STATE.pending[1]}>{mapsKey ? "Chave configurada" : "Usando OpenStreetMap"}</Badge>
            </div>
            <p className="mt-3 text-xs text-ink-300">{mapsKey ? "VITE_GOOGLE_MAPS_BROWSER_KEY definida." : "Sem chave do Google Maps JavaScript, o mapa usa Leaflet + OpenStreetMap (funcional)."} Para usar o Google Maps, crie uma chave restrita por referenciador HTTP (seu domínio) com a Maps JavaScript API e defina VITE_GOOGLE_MAPS_BROWSER_KEY (e opcionalmente VITE_GOOGLE_MAPS_MAP_ID).</p>
          </Card>
          <Card className="p-5">
            <div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-white/[0.04] text-lime-400"><FileDown className="size-5" /></div>
              <div><div className="heading font-semibold text-white">Geração de PDF</div><div className="text-xs text-ink-400">Propostas e relatórios gerados localmente (jsPDF).</div></div>
              <Badge className={`ml-auto ${STATE.connected[1]}`}><CheckCircle2 className="size-3" />Ativo</Badge></div>
          </Card>
        </div>
      )}
    </>
  );
}
