import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ScanSearch, Activity, Copy as CopyIcon, RefreshCw, ServerCrash } from "lucide-react";
import { supabase } from "../lib/supabase";
import { callFunction, errorMessage } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { useBatchRunner } from "../hooks/useBatchRunner";
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, PageLoader, StatCard } from "../components/ui";
import { DigitalStatusBadge } from "../components/ui/StatusBadges";
import { fmtDateTime } from "../lib/format";

export function DigitalAnalysisPage() {
  const { orgId } = useAuth();
  const runner = useBatchRunner();
  const nav = useNavigate();
  const [monitoring, setMonitoring] = useState(false);
  const q = useQuery({
    queryKey: ["analysis", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const [audits, pending, stale, dupes, offline] = await Promise.all([
        supabase.from("digital_audits").select("id, business_id, created_at, website_url, status, pages_analyzed, robots_allowed, error, businesses(name, city, digital_status, opportunity_score)").eq("organization_id", orgId!).order("created_at", { ascending: false }).limit(60),
        supabase.from("businesses").select("id", { count: "exact" }).eq("organization_id", orgId!).is("analyzed_at", null).limit(500),
        supabase.from("businesses").select("id", { count: "exact" }).eq("organization_id", orgId!).lt("analyzed_at", new Date(Date.now() - 30 * 86400_000).toISOString()).limit(500),
        supabase.rpc("duplicate_websites", { p_org: orgId }),
        supabase.from("business_websites").select("id, url, last_checked_at, error, business_id, businesses(name)").eq("organization_id", orgId!).eq("kind", "own_site").eq("is_online", false).limit(50),
      ]);
      return { audits: audits.data ?? [], pending: pending.data ?? [], pendingCount: pending.count ?? 0, stale: stale.data ?? [], staleCount: stale.count ?? 0, dupes: dupes.data ?? [], offline: offline.data ?? [] };
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
      const r = await callFunction<{ checked: number; offline: number; changed: number }>("site-monitor", { limit: 50, older_than_hours: 12 });
      toast.success(`${r.checked} sites verificados · ${r.offline} fora do ar · ${r.changed} mudanças de status`);
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
        <StatCard label="Sites fora do ar" value={d.offline.length} icon={ServerCrash} />
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
                    <div className="text-xs text-ink-400 truncate">{a.website_url ?? "Sem site próprio"} · {a.pages_analyzed} pág. · {fmtDateTime(a.created_at)}{a.robots_allowed === false ? " · robots.txt" : ""}</div>
                  </div>
                  <div className="flex items-center gap-2">{a.businesses && <DigitalStatusBadge status={a.businesses.digital_status} />}<span className="heading text-lime-400">{a.businesses?.opportunity_score ?? "—"}</span></div>
                </Link>
              ))}
            </div>
          )}
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Sites fora do ar" icon={ServerCrash} />
            <div className="px-5 pb-5 space-y-2">
              {!d.offline.length && <p className="text-sm text-ink-400">Nenhum site fora do ar detectado.</p>}
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
