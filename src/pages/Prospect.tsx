import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Zap, MessageCircle, Phone, SkipForward, XCircle, Target, CheckCircle2, MapPin, Star, Globe } from "lucide-react";
import { db, uid, nowIso, updateLead } from "../lib/db";
import { leadsWithBusiness } from "../lib/services";
import { generateMessage } from "../lib/messages";
import { useSettings } from "../hooks/useSettings";
import { Badge, Button, Card, CardHeader, EmptyState, Field, PageHeader, PageLoader, ProgressBar, ScoreRing } from "../components/ui";
import { DigitalStatusBadge } from "../components/ui/StatusBadges";
import { CATEGORIES } from "../lib/constants";
import { digits, whatsappLink } from "../lib/format";

const OPEN = ["novo", "nao_analisado", "analisado", "oportunidade"];
const GOAL_KEY = "radar.prospect.goal";

/** Modo prospecção: fila priorizada de leads com mensagem pronta, registro automático no CRM. */
export function ProspectPage() {
  const qc = useQueryClient();
  const { settings } = useSettings();
  const [city, setCity] = useState("");
  const [category, setCategory] = useState("");
  const [onlyHigh, setOnlyHigh] = useState(true);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [goal, setGoal] = useState(() => Number(localStorage.getItem(GOAL_KEY)) || 20);
  const [custom, setCustom] = useState<Record<string, string>>({});

  const q = useQuery({ queryKey: ["leads", "prospect"], queryFn: leadsWithBusiness });
  const today = useQuery({
    queryKey: ["prospect-today"],
    queryFn: async () => {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      return db.lead_notes.filter((n) => ["whatsapp", "call"].includes(n.kind) && n.created_at >= start.toISOString()).count();
    },
  });
  const queue = useMemo(() => (q.data ?? []).filter((l) => {
    const b = l.businesses!;
    if (!OPEN.includes(l.status) || skipped.has(l.id)) return false;
    if (!b.phone && !b.has_whatsapp) return false;
    if (onlyHigh && b.opportunity_level !== "alta") return false;
    if (city && !(b.city ?? "").toLowerCase().includes(city.toLowerCase())) return false;
    if (category && b.category !== category) return false;
    return true;
  }).sort((a, b) => Number(b.is_priority) - Number(a.is_priority) || (b.businesses!.opportunity_score ?? 0) - (a.businesses!.opportunity_score ?? 0)), [q.data, skipped, onlyHigh, city, category]);

  const current = queue[0];
  const opp = useQuery({ queryKey: ["opp", current?.business_id], enabled: !!current, queryFn: async () => (await db.opportunities.get(current!.business_id)) ?? null });
  const wa = useQuery({ queryKey: ["wa", current?.business_id], enabled: !!current, queryFn: async () => (await db.contacts.where("business_id").equals(current!.business_id).filter((c) => c.type === "whatsapp").first()) ?? null });

  if (q.isLoading) return <PageLoader />;
  const b = current?.businesses;
  const defaultMsg = b ? generateMessage("whatsapp", b, opp.data ?? null, { name: settings.seller_name, company: settings.seller_company }).split(/\n-{3,}\n/)[0] : "";
  const msg = current ? custom[current.id] ?? defaultMsg : "";
  const waNumber = wa.data?.value && /^\d{10,13}$/.test(wa.data.value) ? wa.data.value : b?.phone;
  const done = today.data ?? 0;

  const register = async (kind: "whatsapp" | "call") => {
    if (!current) return;
    await db.lead_notes.add({ id: uid(), lead_id: current.id, kind, content: kind === "whatsapp" ? `Mensagem enviada pelo WhatsApp (modo prospecção):\n${msg}` : "Ligação feita pelo modo prospecção", created_at: nowIso() });
    const follow = new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10);
    await updateLead(current.id, { status: "primeiro_contato", next_follow_up: current.next_follow_up ?? follow });
    toast.success(`${b!.name}: contato registrado · retorno em ${new Date(follow + "T12:00:00").toLocaleDateString("pt-BR")}`);
    ["leads", "prospect-today", "dashboard", "agenda"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  };
  const discard = async () => {
    if (!current) return;
    await updateLead(current.id, { status: "perdido", lost_reason: "Sem contato válido (modo prospecção)" });
    qc.invalidateQueries({ queryKey: ["leads"] });
    toast("Lead marcado como perdido");
  };

  return (
    <>
      <PageHeader title="Modo prospecção" subtitle="Um lead por vez, com mensagem pronta — o CRM é atualizado sozinho" icon={Zap} />
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {!current || !b ? (
            <Card><EmptyState icon={CheckCircle2} title="Fila vazia" description="Nenhum lead com telefone nestes filtros. Faça novas pesquisas, analise os estabelecimentos ou ajuste os filtros ao lado." action={<Link to="/pesquisa"><Button>Nova pesquisa</Button></Link>} /></Card>
          ) : (
            <Card className="p-5 animate-slide-up" key={current.id}>
              <div className="flex items-start gap-4">
                <ScoreRing score={b.opportunity_score} size={64} />
                <div className="min-w-0 flex-1">
                  <Link to={`/estabelecimento/${b.id}`} className="heading text-xl font-semibold text-white hover:text-lime-400">{b.name}</Link>
                  <div className="text-sm text-ink-300">{b.category} · {[b.neighborhood, b.city].filter(Boolean).join(", ")}</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <DigitalStatusBadge status={b.digital_status} />
                    {b.rating != null && <Badge><Star className="size-3 fill-amber-300 text-amber-300" />{b.rating} ({b.user_rating_count})</Badge>}
                    {current.is_priority && <Badge className="border-lime-400/30 text-lime-400 bg-lime-400/10">Prioritário</Badge>}
                  </div>
                </div>
              </div>
              {opp.data && (
                <div className="mt-4 space-y-1">
                  {opp.data.reasons.filter((r) => r.weight > 0).slice(0, 4).map((r, i) => (
                    <div key={i} className="text-xs text-ink-200 flex gap-2"><Target className="size-3.5 text-lime-400 shrink-0 mt-0.5" />{r.text}</div>
                  ))}
                </div>
              )}
              <div className="mt-4">
                <Field label="Mensagem (edite à vontade)"><textarea className="input min-h-36" value={msg} onChange={(e) => setCustom({ ...custom, [current.id]: e.target.value })} /></Field>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <a href={whatsappLink(waNumber, msg) ?? undefined} target="_blank" rel="noreferrer" onClick={() => register("whatsapp")}>
                  <Button size="lg" icon={MessageCircle} className="w-full" disabled={!waNumber}>Enviar no WhatsApp</Button>
                </a>
                <a href={b.phone ? `tel:${digits(b.international_phone ?? b.phone)}` : undefined} onClick={() => b.phone && register("call")}>
                  <Button size="lg" variant="secondary" icon={Phone} className="w-full" disabled={!b.phone}>Ligar</Button>
                </a>
                <Button variant="ghost" icon={SkipForward} onClick={() => setSkipped(new Set(skipped).add(current.id))}>Pular por agora</Button>
                <Button variant="danger" icon={XCircle} onClick={discard}>Telefone inválido / descartar</Button>
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-xs">
                {b.primary_website && <a className="text-lime-400 hover:underline inline-flex items-center gap-1" href={b.primary_website} target="_blank" rel="noreferrer"><Globe className="size-3" />Ver site</a>}
                <a className="text-lime-400 hover:underline inline-flex items-center gap-1" href={b.google_maps_uri ?? "#"} target="_blank" rel="noreferrer"><MapPin className="size-3" />Ver no mapa</a>
                <Link className="text-lime-400 hover:underline" to={`/gerador-sites?business=${b.id}&kind=demo`}>Criar site demonstração para enviar</Link>
              </div>
            </Card>
          )}
          {queue.length > 1 && (
            <Card>
              <CardHeader title={`Próximos na fila (${queue.length - 1})`} icon={Zap} />
              <div className="px-5 pb-5 divide-y divide-white/[0.04]">
                {queue.slice(1, 8).map((l) => (
                  <div key={l.id} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-ink-100 truncate">{l.businesses!.name} <span className="text-xs text-ink-400">· {l.businesses!.city}</span></span>
                    <span className="text-xs text-lime-400">{l.businesses!.opportunity_score ?? "—"}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center justify-between"><span className="text-sm text-white font-medium">Meta de hoje</span><span className="heading text-lime-400 text-xl">{done}/{goal}</span></div>
            <ProgressBar className="mt-2" value={(done / Math.max(1, goal)) * 100} />
            <div className="mt-3 flex items-center gap-2 text-xs text-ink-400">Meta diária:
              <input type="number" min={1} className="input h-8 w-20 py-0" value={goal} onChange={(e) => { const v = Math.max(1, Number(e.target.value) || 1); setGoal(v); localStorage.setItem(GOAL_KEY, String(v)); }} />
            </div>
          </Card>
          <Card className="p-5 space-y-3">
            <div className="text-sm font-medium text-white">Filtros da fila</div>
            <input className="input" placeholder="Cidade" value={city} onChange={(e) => setCity(e.target.value)} />
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Todas as categorias</option>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <label className="flex items-center gap-2 text-sm text-ink-200"><input type="checkbox" className="accent-lime-400" checked={onlyHigh} onChange={(e) => setOnlyHigh(e.target.checked)} />Só oportunidade alta</label>
            <p className="text-[11px] text-ink-500">Mostra leads ainda não contatados, com telefone, ordenados por prioridade e pontuação. Ao enviar, o lead vai para “Primeiro contato” com retorno agendado em 2 dias.</p>
          </Card>
        </div>
      </div>
    </>
  );
}
