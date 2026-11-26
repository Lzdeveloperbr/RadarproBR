import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ScanSearch, Activity, Copy as CopyIcon, RefreshCw, ServerCrash } from "lucide-react";
import { db } from "../lib/db";
import { duplicateWebsites, monitorSites } from "../lib/services";
const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
import { useBatchRunner } from "../hooks/useBatchRunner";
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, PageLoader, StatCard } from "../components/ui";
import { DigitalStatusBadge } from "../components/ui/StatusBadges";
import { fmtDateTime } from "../lib/format";

export function DigitalAnalysisPage() {
  const runner = useBatchRunner();
  const nav = useNavigate();
  const [monitoring, setMonitoring] = useState(false);
  const q = useQuery({
    queryKey: ["analysis"],
    queryFn: async () => {
      const audits = (await db.audits.orderBy("created_at").reverse().limit(60).toArray());
      const bizMap = new Map((await db.businesses.bulkGet(audits.map((a) => a.business_id))).filter(Boolean).map((b) => [b!.id, b!]));
      const all = await db.businesses.toArray();
      const pending = all.filter((b) => !b.analyzed_at).slice(0, 500);
      const staleDate = new Date(Date.now() - 30 * 86400_000).toISOString();
      const stale = all.filter((b) => b.analyzed_at && b.analyzed_at < staleDate).slice(0, 500);
      const offlineSites = (await db.websites.where("kind").equals("own_site").filter((w) => w.https === false).toArray()).slice(0, 50);
      const offBiz = new Map((await db.businesses.bulkGet(offlineSites.map((w) => w.business_id))).filter(Boolean).map((b) => [b!.id, b!]));
      return {
        audits: audits.map((a) => ({ ...a, businesses: bizMap.get(a.business_id) })).filter((a) => a.businesses),
        pending, pendingCount: all.filter((b) => !b.analyzed_at).length, stale, staleCount: all.filter((b) => b.analyzed_at && b.analyzed_at < staleDate).length,
        dupes: await duplicateWebsites(),
        offline: offlineSites.map((w) => ({ ...w, businesses: offBiz.get(w.business_id) })),
      };
    },
  });

  const queue = async (ids: string[], label: string) => {
    if (!ids.length) return toast("Nada para analisar");
    try {
      const id = await runner.createJob(label, "audit", ids.map((b) => ({ type: "audit", business_id: b })));
      nav(`/lote/${id}`);
    } catch (e) { toast.error(errorMessage(e)); }
  };
  const monitor = async () => {
    setMonitoring(true);
    try {
      const r = await monitorSites(50);
      toast.success(`${r.checked} sites verificados · ${r.offline} sem resposta em HTTPS · ${r.changed} mudanças de status`);
      q.refetch();
    } catch (e) { toast.error(errorMessage(e)); } finally { setMonitoring(false); }
  };

  if (q.isLoading || !q.data) return <PageLoader />;
  const d = q.data;
  return (
    <>
      <PageHeader title="Análise digital" subtitle="Investigação automatizada, reanálise e monitoramento de disponibilidade" icon={ScanSearch}
        actions={<Button variant="secondary" icon={Activity} loading={monitoring} onClick={monitor}>Verificar disponibilidade dos sites</Button>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Não analisados" value={d.pendingCount} icon={ScanSearch} accent onClick={() => queue(d.pending.map((x: any) => x.id), `Análise de ${d.pending.length} estabelecimentos pendentes`)} hint="Clique para analisar" />
        <StatCard label="Análises com +30 dias" value={d.staleCount} icon={RefreshCw} onClick={() => queue(d.stale.map((x: any) => x.id), `Reanálise de ${d.stale.length} estabelecimentos`)} hint="Clique para reanalisar" />
        <StatCard label="Sites sem resposta HTTPS" value={d.offline.length} icon={ServerCrash} />
        <StatCard label="Domínios duplicados" value={d.dupes.length} icon={CopyIcon} />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Análises recentes" icon={ScanSearch} />
          {!d.audits.length ? <EmptyState title="Nenhuma análise ainda" /> : (
            <div className="divide-y divide-white/[0.04]">
              {d.audits.map((a: any) => (
                <Link key={a.id} to={`/estabelecimento/${a.business_id}`} className="flex flex-col gap-1 px-5 py-3 hover:bg-white/[0.02] sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-sm text-white truncate">{a.businesses?.name}</div>
                    <div className="text-xs text-ink-400 truncate">{a.website_url ?? "Sem site próprio identificado"} · {fmtDateTime(a.created_at)}</div>
                  </div>
                  <div className="flex items-center gap-2">{a.businesses && <DigitalStatusBadge status={a.businesses.digital_status} />}<span className="heading text-lime-400">{a.businesses?.opportunity_score ?? "—"}</span></div>
                </Link>
              ))}
            </div>
          )}
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Sites sem resposta em HTTPS" subtitle="Sem certificado ou fora do ar" icon={ServerCrash} />
            <div className="px-5 pb-5 space-y-2">
              {!d.offline.length && <p className="text-sm text-ink-400">Nenhum problema detectado.</p>}
              {d.offline.map((w: any) => (
                <Link key={w.id} to={`/estabelecimento/${w.business_id}`} className="block rounded-lg p-2 hover:bg-white/[0.03]">
                  <div className="text-sm text-white">{w.businesses?.name}</div>
                  <div className="text-[11px] text-ink-400 break-all">{w.url} · {w.error ?? ""} · {fmtDateTime(w.last_checked_at)}</div>
                </Link>
              ))}
            </div>
          </Card>
          <Card>
            <CardHeader title="Detecção de sites duplicados" subtitle="Mesmo domínio usado por vários estabelecimentos" icon={CopyIcon} />
            <div className="px-5 pb-5 space-y-2">
              {!d.dupes.length && <p className="text-sm text-ink-400">Nenhum domínio compartilhado.</p>}
              {d.dupes.map((x: any) => (
                <div key={x.domain} className="rounded-lg bg-white/[0.02] p-2">
                  <div className="flex justify-between text-sm"><span className="text-white">{x.domain}</span><Badge>{x.businesses}</Badge></div>
                  <div className="text-[11px] text-ink-400">{x.names.join(" · ")}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
