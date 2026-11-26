import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plug, CheckCircle2, AlertTriangle, RefreshCw, Map as MapIcon, Globe2, FileDown, Database, Search, Clock } from "lucide-react";
import { Badge, Button, Card, PageHeader } from "../components/ui";
import { db } from "../lib/db";
import { fmtNumber } from "../lib/format";

type Status = { state: "connected" | "error" | "pending"; message: string };

async function test(url: string, init?: RequestInit): Promise<Status> {
  try {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
    return r.ok ? { state: "connected", message: `Respondeu com sucesso (HTTP ${r.status})` } : { state: "error", message: `HTTP ${r.status}${r.status === 429 ? " — muitas requisições, aguarde um pouco" : ""}` };
  } catch (e) {
    return { state: "error", message: "Sem conexão: " + (e as Error).message };
  }
}

const STATE = {
  connected: ["Conectado", "border-lime-400/30 text-lime-400 bg-lime-400/10", CheckCircle2],
  error: ["Indisponível", "border-rose-400/30 text-rose-300 bg-rose-400/10", AlertTriangle],
  pending: ["Não testado", "border-white/10 text-ink-300 bg-white/5", Clock],
} as const;

export function IntegrationsPage() {
  const [results, setResults] = useState<Record<string, Status>>({});
  const [testing, setTesting] = useState(false);
  const usage = useQuery({
    queryKey: ["usage"],
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86400_000).toISOString();
      const rows = await db.usage.where("created_at").above(since).toArray();
      const agg = (p: string) => ({ total: rows.filter((r) => r.provider === p).length, errors: rows.filter((r) => r.provider === p && !r.success).length });
      return { osm: agg("openstreetmap"), site: agg("site_check") };
    },
  });
  const runTests = async () => {
    setTesting(true);
    const [nom, ovp] = await Promise.all([
      test("https://nominatim.openstreetmap.org/search?q=Votuporanga&format=jsonv2&limit=1&countrycodes=br"),
      test("https://overpass-api.de/api/interpreter", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent("[out:json][timeout:10];node(1);out;") }),
    ]);
    setResults({ nominatim: nom, overpass: ovp });
    setTesting(false);
  };
  const items = [
    { key: "overpass", title: "OpenStreetMap — Overpass API", icon: Search, desc: "Pesquisa de estabelecimentos por categoria e raio. Gratuita, sem chave.", usage: usage.data?.osm },
    { key: "nominatim", title: "OpenStreetMap — Nominatim", icon: Globe2, desc: "Localiza cidades e bairros (coordenadas e área do município). Gratuita, sem chave." },
  ];
  return (
    <>
      <PageHeader title="Integrações" subtitle="Tudo gratuito, sem cadastro e sem chave de API" icon={Plug}
        actions={<Button icon={RefreshCw} loading={testing} onClick={runTests}>Testar conexões</Button>} />
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((it) => {
          const st = results[it.key] ?? { state: "pending", message: "Clique em Testar conexões" };
          const [label, cls, Icon] = STATE[st.state];
          return (
            <Card key={it.key} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-xl bg-white/[0.04] text-lime-400"><it.icon className="size-5" /></div>
                  <div><div className="heading font-semibold text-white">{it.title}</div><div className="text-xs text-ink-400">{it.desc}</div></div>
                </div>
                <Badge className={cls}><Icon className="size-3" />{label}</Badge>
              </div>
              <p className="mt-3 text-xs text-ink-300">{st.message}</p>
              {it.usage && <p className="mt-2 text-[11px] text-ink-500">Uso neste navegador (30 dias): {fmtNumber(it.usage.total)} consultas · {it.usage.errors} falhas</p>}
            </Card>
          );
        })}
        {[
          { title: "Mapa (Leaflet + OpenStreetMap/CARTO)", icon: MapIcon, desc: "Mapa interativo com marcadores, agrupamento, rotas e cores por presença digital." },
          { title: "Teste de sites", icon: Globe2, desc: `Verifica se o site responde com HTTPS direto do navegador. ${usage.data ? `${usage.data.site.total} testes nos últimos 30 dias.` : ""}` },
          { title: "Banco de dados local", icon: Database, desc: "Seus dados ficam salvos neste navegador (IndexedDB). Faça backup em Dados e backup." },
          { title: "PDF, Excel e CSV", icon: FileDown, desc: "Propostas e relatórios gerados no próprio aparelho." },
        ].map((x) => (
          <Card key={x.title} className="p-5">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-xl bg-white/[0.04] text-lime-400"><x.icon className="size-5" /></div>
              <div className="flex-1"><div className="heading font-semibold text-white">{x.title}</div><div className="text-xs text-ink-400">{x.desc}</div></div>
              <Badge className={STATE.connected[1]}><CheckCircle2 className="size-3" />Ativo</Badge>
            </div>
          </Card>
        ))}
      </div>
      <Card className="mt-4 p-5 text-xs text-ink-300 space-y-1.5">
        <div className="heading text-sm font-semibold text-white">Sobre os dados do OpenStreetMap</div>
        <p>O OpenStreetMap é um mapa colaborativo mantido por voluntários. Comércios que ainda não foram cadastrados não aparecem, e não há notas/avaliações.</p>
        <p>Dados © colaboradores do OpenStreetMap, disponíveis sob a licença ODbL. O uso respeita as políticas dos servidores públicos (consultas moderadas e espaçadas).</p>
      </Card>
    </>
  );
}
