import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Layers, Play, Pause, XCircle, RotateCcw, Radar, CheckCircle2, AlertCircle, Loader2, Clock, ListChecks } from "lucide-react";
import { db } from "../lib/db";
import { useSettings } from "../hooks/useSettings";
import { useBatchRunner, type ItemPayload } from "../hooks/useBatchRunner";
import { Badge, Button, Card, CardHeader, EmptyState, Field, PageHeader, PageLoader, ProgressBar, Toggle } from "../components/ui";
import { CategoryPicker } from "../components/CategoryPicker";
import { CityInput } from "../components/CityInput";
import { UFS } from "../lib/constants";
const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
import { fmtDateTime } from "../lib/format";

const JOB_STATUS: Record<string, [string, string]> = {
  pending: ["Na fila", ""], running: ["Em andamento", "border-lime-400/30 text-lime-400 bg-lime-400/10"], paused: ["Pausada", "border-amber-300/30 text-amber-300 bg-amber-300/10"],
  completed: ["Concluída", "border-emerald-400/30 text-emerald-400 bg-emerald-400/10"], failed: ["Falhou", "border-rose-400/30 text-rose-300 bg-rose-400/10"], cancelled: ["Cancelada", ""],
};

export function JobControls({ job }: { job: any }) {
  const r = useBatchRunner();
  return (
    <div className="flex flex-wrap gap-2">
      {job.status === "running" && <Button size="sm" variant="secondary" icon={Pause} onClick={() => r.pause(job.id)}>Pausar</Button>}
      {(job.status === "paused" || job.status === "pending") && <Button size="sm" icon={Play} onClick={() => r.resume(job.id)}>Continuar</Button>}
      {["running", "paused", "pending"].includes(job.status) && <Button size="sm" variant="danger" icon={XCircle} onClick={() => confirm("Cancelar os itens restantes?") && r.cancel(job.id)}>Cancelar</Button>}
      {job.failed_items > 0 && !["running"].includes(job.status) && <Button size="sm" variant="secondary" icon={RotateCcw} onClick={() => r.retryFailed(job.id)}>Repetir falhas</Button>}
    </div>
  );
}

export function BatchPage() {
  const { settings } = useSettings();
  const runner = useBatchRunner();
  const nav = useNavigate();
  const [cities, setCities] = useState("");
  const [pick, setPick] = useState("");
  const [state, setState] = useState(settings.default_state ?? "");
  const [cats, setCats] = useState<string[]>([]);
  const [radius, setRadius] = useState(15);
  const [max, setMax] = useState(60);
  const [whole, setWhole] = useState(true);
  const [autoAudit, setAutoAudit] = useState(true);
  const [creating, setCreating] = useState(false);

  const jobs = useQuery({
    queryKey: ["batch", "list"],
    refetchInterval: 2000,
    queryFn: () => db.batch_jobs.orderBy("created_at").reverse().limit(50).toArray(),
  });
  const cityList = cities.split(/[\n;]+/).map((c) => c.trim()).filter(Boolean);
  const total = cityList.length * cats.length;

  const create = async () => {
    if (!cityList.length || !cats.length) return toast.error("Informe ao menos uma cidade e uma categoria");
    if (total > 200) return toast.error("Máximo de 200 combinações cidade × categoria por lote");
    setCreating(true);
    try {
      const items: ItemPayload[] = cityList.flatMap((city) => cats.map((c) => ({
        type: "search" as const, auto_audit: autoAudit,
        params: { country: "Brasil", state, city, categories: [c], radius_km: radius, max_results: max, whole_city: whole },
      })));
      const id = await runner.createJob(`Lote: ${cats.length} categoria(s) em ${cityList.length} cidade(s)`, "search", items);
      toast.success(`${items.length} pesquisas adicionadas à fila`);
      nav(`/lote/${id}`);
    } catch (e) { toast.error(errorMessage(e)); } finally { setCreating(false); }
  };

  return (
    <>
      <PageHeader title="Pesquisa em lote" subtitle="Pesquise centenas de estabelecimentos em várias cidades e categorias, respeitando os limites das APIs" icon={Layers} />
      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <Card>
          <CardHeader title="Novo lote" icon={Radar} subtitle={`${total} pesquisa(s) · até ${total * max} estabelecimentos`} />
          <div className="px-5 pb-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Field label="Cidades (uma por linha)"><textarea className="input min-h-28" placeholder={"São José do Rio Preto\nVotuporanga\nFernandópolis"} value={cities} onChange={(e) => setCities(e.target.value)} /></Field>
                <div className="mt-2 flex gap-2">
                  <div className="flex-1"><CityInput uf={state} value={pick} onChange={setPick} placeholder="Buscar cidade no IBGE para adicionar" showPopulation={false} /></div>
                  <Button size="sm" variant="secondary" onClick={() => { if (pick.trim()) { setCities((c) => (c.trim() ? c.trim() + "\n" : "") + pick.trim()); setPick(""); } }}>Adicionar</Button>
                </div>
              </div>
              <div className="space-y-3">
                <Field label="Estado"><select className="input" value={state} onChange={(e) => setState(e.target.value)}><option value="">—</option>{UFS.map(([uf, n]) => <option key={uf} value={uf}>{n}</option>)}</select></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Raio (km)"><input type="number" className="input" min={1} max={50} value={radius} onChange={(e) => setRadius(Number(e.target.value) || 10)} /></Field>
                  <Field label="Máx. por pesquisa"><input type="number" className="input" min={1} max={300} value={max} onChange={(e) => setMax(Number(e.target.value) || 60)} /></Field>
                </div>
              </div>
            </div>
            <CategoryPicker value={cats} onChange={setCats} />
            <div className="flex flex-wrap gap-5">
              <Toggle checked={whole} onChange={setWhole} label="Cidade inteira" />
              <Toggle checked={autoAudit} onChange={setAutoAudit} label="Analisar presença digital automaticamente" />
            </div>
            <Button icon={Layers} loading={creating} onClick={create}>Adicionar à fila</Button>
          </div>
        </Card>
        <Card className="p-5 text-xs text-ink-300 space-y-2">
          <div className="heading text-sm font-semibold text-white">Como a fila funciona</div>
          <p>• Os itens ficam salvos no navegador: você pode fechar a página e continuar depois (a fila só avança com o app aberto).</p>
          <p>• Até 2 itens em paralelo, com pausas para respeitar os servidores públicos do OpenStreetMap.</p>
          <p>• Falhas temporárias são repetidas automaticamente (até 3 tentativas, com espera crescente).</p>
          <p>• Se o OpenStreetMap estiver ocupado, a fila espera e tenta de novo automaticamente.</p>
        </Card>
      </div>
      <Card className="mt-4">
        <CardHeader title="Filas" icon={ListChecks} />
        {jobs.isLoading ? <PageLoader /> : !(jobs.data ?? []).length ? <EmptyState title="Nenhuma fila ainda" /> : (
          <div className="divide-y divide-white/[0.04]">
            {jobs.data!.map((j: any) => (
              <div key={j.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
                <Link to={`/lote/${j.id}`} className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><span className="text-sm font-medium text-white hover:text-lime-400 truncate">{j.name}</span><Badge className={JOB_STATUS[j.status]?.[1]}>{JOB_STATUS[j.status]?.[0]}</Badge></div>
                  <div className="text-xs text-ink-400">{fmtDateTime(j.created_at)} · {j.found_count} encontrados · {j.analyzed_count} analisados · {j.failed_items} falhas</div>
                  <ProgressBar className="mt-2 max-w-md" value={j.total_items ? ((j.done_items + j.failed_items) / j.total_items) * 100 : 0} />
                </Link>
                <JobControls job={j} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

export function BatchDetailPage() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const job = useQuery({
    queryKey: ["batch", "job", id],
    refetchInterval: (q) => (["running", "pending"].includes((q.state.data as any)?.job?.status) ? 2000 : false),
    queryFn: async () => {
      const job = await db.batch_jobs.get(id!);
      if (!job) throw new Error("Fila não encontrada");
      return { job, items: (await db.batch_items.where("batch_job_id").equals(id!).toArray()).sort((a, b) => a.seq - b.seq) };
    },
  });
  if (job.isLoading) return <PageLoader />;
  if (!job.data) return <EmptyState title="Fila não encontrada" />;
  const { job: j, items } = job.data;
  const searches = items.filter((i: any) => i.payload.type === "search");
  const audits = items.filter((i: any) => i.payload.type === "audit");
  const pct = j.total_items ? ((j.done_items + j.failed_items) / j.total_items) * 100 : 0;
  const running = items.filter((i: any) => i.status === "running");
  const filter = sp.get("filter");
  const searchIds = searches.map((s: any) => s.result?.search_id).filter(Boolean);
  const icon = (s: string) => s === "done" ? <CheckCircle2 className="size-4 text-lime-400" /> : s === "failed" ? <AlertCircle className="size-4 text-rose-400" /> : s === "running" ? <Loader2 className="size-4 animate-spin text-lime-400" /> : s === "cancelled" ? <XCircle className="size-4 text-ink-500" /> : <Clock className="size-4 text-ink-400" />;

  return (
    <>
      <PageHeader title={j.name} subtitle={`Criada em ${fmtDateTime(j.created_at)}`} icon={Layers} actions={<JobControls job={j} />} />
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Badge className={JOB_STATUS[j.status]?.[1]}>{JOB_STATUS[j.status]?.[0]}</Badge>
          <span className="heading text-2xl text-white">{Math.round(pct)}%</span>
        </div>
        <ProgressBar className="mt-3 h-3" value={pct} />
        {running.length > 0 && (
          <p className="mt-2 text-xs text-ink-300 flex items-center gap-2"><Loader2 className="size-3.5 animate-spin text-lime-400" />
            {running.map((i: any) => i.payload.type === "search" ? `Consultando OpenStreetMap: ${[...(i.payload.params.categories ?? []), i.payload.params.custom_category].filter(Boolean).join(", ")}` : "Analisando presença digital").join(" · ")}
          </p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5 text-center">
          {[["Itens", j.total_items], ["Concluídos", j.done_items], ["Falhas", j.failed_items], ["Encontrados", j.found_count], ["Analisados", j.analyzed_count]].map(([l, v]) => (
            <div key={l as string} className="rounded-xl bg-white/[0.03] p-3"><div className="heading text-xl text-white">{v as number}</div><div className="text-[11px] text-ink-400">{l}</div></div>
          ))}
        </div>
        {searchIds.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {searchIds.length === 1 ? (
              <Link to={`/resultados?search=${searchIds[0]}${filter && filter !== "all" ? `&f=${filter}` : ""}`}><Button icon={ListChecks}>Ver resultados {j.status === "running" ? "parciais" : ""}</Button></Link>
            ) : <Link to="/resultados"><Button icon={ListChecks}>Ver estabelecimentos</Button></Link>}
          </div>
        )}
      </Card>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title={`Pesquisas (${searches.length})`} icon={Radar} />
          <div className="px-5 pb-5 space-y-1 max-h-[60vh] overflow-y-auto">
            {searches.map((i: any) => (
              <div key={i.id} className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.02]">
                {icon(i.status)}
                <div className="min-w-0 flex-1 text-sm">
                  <div className="text-ink-100">{[...(i.payload.params.categories ?? []), i.payload.params.custom_category].filter(Boolean).join(", ")} — {i.payload.params.city || "ponto no mapa"}</div>
                  {i.result && <Link to={`/resultados?search=${i.result.search_id}`} className="text-xs text-lime-400 hover:underline">{i.result.found} encontrados · {i.result.new} novos</Link>}
                  {i.error && <div className="text-xs text-rose-300">{i.error} {i.status === "pending" && `(nova tentativa ${i.attempts + 1}/${i.max_attempts})`}</div>}
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title={`Análises digitais (${audits.filter((a: any) => a.status === "done").length}/${audits.length})`} icon={CheckCircle2} />
          <div className="px-5 pb-5 space-y-1 max-h-[60vh] overflow-y-auto">
            {!audits.length && <p className="text-sm text-ink-400">As análises aparecem aqui após cada pesquisa.</p>}
            {audits.map((i: any) => (
              <Link key={i.id} to={`/estabelecimento/${i.payload.business_id}`} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-white/[0.03]">
                {icon(i.status)}
                <span className="text-xs text-ink-300 flex-1 truncate">{i.error ?? (i.result ? `${i.result.name ?? ""} · pontuação ${i.result.score} · ${i.result.level}` : "Aguardando")}</span>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
