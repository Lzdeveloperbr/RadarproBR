import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { History, Radar, Eye } from "lucide-react";
import { db } from "../lib/db";
import { Badge, Card, CardHeader, EmptyState, PageHeader, PageLoader } from "../components/ui";
import { fmtDateTime } from "../lib/format";

export function HistoryPage() {
  const q = useQuery({
    queryKey: ["history"],
    queryFn: async () => {
      const searches = await db.searches.orderBy("created_at").reverse().limit(200).toArray();
      const views = await db.views.orderBy("viewed_at").reverse().limit(150).toArray();
      const biz = await db.businesses.bulkGet(views.map((v) => v.business_id));
      const v = views.map((x, i) => ({ ...x, businesses: biz[i] })).filter((x) => x.businesses);
      const seen = new Set<string>();
      return { searches, views: v.filter((x: any) => (seen.has(x.business_id) ? false : (seen.add(x.business_id), true))).slice(0, 40) };
    },
  });
  if (q.isLoading || !q.data) return <PageLoader />;
  return (
    <>
      <PageHeader title="Histórico" subtitle="Pesquisas realizadas e navegação recente" icon={History} />
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <Card className="overflow-hidden">
          <CardHeader title="Histórico de pesquisas" icon={Radar} />
          {!q.data.searches.length ? <EmptyState title="Nenhuma pesquisa" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-[11px] uppercase tracking-wider text-ink-400 border-b border-white/[0.06]"><th className="py-3 pl-5">Pesquisa</th><th>Local</th><th>Raio</th><th>Encontrados</th><th>Analisados</th><th>Status</th><th className="pr-5">Data</th></tr></thead>
                <tbody>
                  {q.data.searches.map((s: any) => (
                    <tr key={s.id} className="table-row">
                      <td className="py-3 pl-5"><Link to={`/resultados?search=${s.id}`} className="text-white hover:text-lime-400">{s.categories.join(", ")}</Link></td>
                      <td className="text-ink-300">{[s.neighborhood, s.city, s.state].filter(Boolean).join(", ")}</td>
                      <td className="text-ink-300">{s.radius_km} km</td>
                      <td className="text-white">{s.total_found} <span className="text-ink-500 text-xs">({s.total_new} novos)</span></td>
                      <td className="text-ink-300">{s.total_analyzed}</td>
                      <td><Badge className={s.status === "completed" ? "border-lime-400/30 text-lime-400 bg-lime-400/10" : s.status === "failed" ? "border-rose-400/30 text-rose-300 bg-rose-400/10" : undefined}>{s.status === "completed" ? "Concluída" : s.status === "failed" ? "Falhou" : s.status === "running" ? "Em andamento" : s.status}</Badge>{s.error && <div className="text-[11px] text-rose-300 max-w-[220px] truncate" title={s.error}>{s.error}</div>}</td>
                      <td className="pr-5 text-xs text-ink-400">{fmtDateTime(s.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card>
          <CardHeader title="Histórico de navegação" icon={Eye} />
          <div className="px-5 pb-5 space-y-1">
            {!q.data.views.length && <p className="text-sm text-ink-400">Nenhuma ficha visualizada.</p>}
            {q.data.views.map((v: any) => (
              <Link key={v.business_id} to={`/estabelecimento/${v.business_id}`} className="block rounded-lg p-2 hover:bg-white/[0.03]">
                <div className="text-sm text-white">{v.businesses?.name}</div>
                <div className="text-[11px] text-ink-400">{v.businesses?.category} · {v.businesses?.city} · {fmtDateTime(v.viewed_at)}</div>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
