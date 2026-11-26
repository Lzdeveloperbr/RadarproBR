import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { clsx } from "clsx";
import {
  Globe, MapPin, MessageCircle, Phone, Camera as Instagram, Copy, Heart, FileText, Wand2, Smartphone, RefreshCw, Star, Clock,
  Building2, ScanSearch, Target, Library, History, Sparkles, CheckCircle2, XCircle, HelpCircle, ExternalLink, Navigation, ThumbsUp as Facebook, ShieldCheck, AlertTriangle, Trash2,
} from "lucide-react";
import { db, uid, nowIso, deleteBusiness } from "../lib/db";
import { auditBusiness, setBusinessWebsite } from "../lib/services";
import { useFavorites } from "../hooks/useFavorites";
import type { Audit, Opportunity } from "../lib/types";
import { Badge, Button, Card, CardHeader, EmptyState, PageLoader, ScoreRing } from "../components/ui";
import { DigitalStatusBadge, OpportunityBadge } from "../components/ui/StatusBadges";
import { MapView } from "../components/MapView";
import { CrmPanel } from "../components/business/CrmPanel";
import { MessagePanel } from "../components/business/MessagePanel";
import { ManualChecklist } from "../components/business/ManualChecklist";
import { CHECK_LABELS, KIND_LABEL } from "../lib/constants";
import { copyText, fmtDateTime, mapsRoute, whatsappLink } from "../lib/format";

const CHECK_ORDER = ["own_site", "site_online", "https", "mobile_viewport", "address", "postal_code", "embedded_map", "maps_link", "directions_button", "coordinates",
  "phone", "whatsapp", "email", "contact_form", "digital_menu", "online_booking", "services", "gallery", "social_links", "opening_hours", "phone_places", "whatsapp_places", "hours_places", "shared_domain"];

function CheckIcon({ v, invert }: { v: boolean | null | undefined; invert?: boolean }) {
  const good = invert ? v === false : v === true;
  if (v == null) return <HelpCircle className="size-4 text-ink-500 shrink-0" />;
  return good ? <CheckCircle2 className="size-4 text-lime-400 shrink-0" /> : <XCircle className="size-4 text-rose-400 shrink-0" />;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-white/[0.04] last:border-0">
      <span className="text-xs text-ink-400 shrink-0">{label}</span>
      <span className="text-sm text-ink-100 text-right break-words min-w-0">{children ?? <span className="text-ink-500">NÃO IDENTIFICADO</span>}</span>
    </div>
  );
}

export function BusinessDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
  const { favorites, toggle } = useFavorites();

  const q = useQuery({
    queryKey: ["business", id],
    enabled: !!id,
    queryFn: async () => {
      const b = await db.businesses.get(id!);
      const [sites, contacts, audits, opp, results, prompts] = await Promise.all([
        db.websites.where("business_id").equals(id!).toArray(),
        db.contacts.where("business_id").equals(id!).toArray(),
        db.audits.where("business_id").equals(id!).toArray(),
        db.opportunities.get(id!),
        db.search_results.where("business_id").equals(id!).toArray(),
        db.prompts.where("business_id").equals(id!).toArray(),
      ]);
      const searchRows = await db.searches.bulkGet(results.map((r) => r.search_id));
      return {
        b: b ?? null,
        sites: sites.sort((x, y) => Number(y.is_primary) - Number(x.is_primary)),
        contacts,
        audits: (audits as Audit[]).sort((x, y) => y.created_at.localeCompare(x.created_at)).slice(0, 10),
        opp: (opp ?? null) as Opportunity | null,
        searches: results.map((r, i) => ({ ...r, searches: searchRows[i] })).sort((x, y) => y.created_at.localeCompare(x.created_at)),
        prompts: prompts.sort((x, y) => y.created_at.localeCompare(x.created_at)).slice(0, 10),
      };
    },
  });

  useEffect(() => {
    if (id) db.views.add({ id: uid(), business_id: id, viewed_at: nowIso() });
  }, [id]);

  const audit = useMutation({
    mutationFn: () => auditBusiness(id!),
    onSuccess: (r: any) => { toast.success(`Análise concluída · pontuação ${r.opportunity.score}`); qc.invalidateQueries({ queryKey: ["business", id] }); qc.invalidateQueries({ queryKey: ["lead", id] }); },
    onError: (e) => toast.error(errorMessage(e), { duration: 8000 }),
  });

  if (q.isLoading) return <PageLoader label="Carregando ficha..." />;
  if (q.error || !q.data?.b) return <EmptyState title="Estabelecimento não encontrado" description={q.error ? errorMessage(q.error) : undefined} action={<Button onClick={() => nav("/resultados")}>Voltar</Button>} />;
  const { b, sites, contacts, audits, opp, searches, prompts } = q.data;
  const last = audits[0];
  const checks = last?.checks ?? {};
  const contactOf = (t: string) => contacts.filter((c: any) => c.type === t);
  const whatsapp = contactOf("whatsapp")[0]?.value as string | undefined;
  const instagram = contactOf("instagram")[0]?.url as string | undefined;
  const facebook = contactOf("facebook")[0]?.url as string | undefined;
  const waTarget = whatsapp && /^\d+$/.test(whatsapp) ? whatsapp : b.phone;

  const copyInfo = async () => {
    const lines = [
      b.name, b.category, b.formatted_address, b.phone && `Telefone: ${b.phone}`, whatsapp && `WhatsApp: ${whatsapp}`,
      `Site: ${b.primary_website ?? "não identificado"}`, instagram && `Instagram: ${instagram}`, b.google_maps_uri && `Google Maps: ${b.google_maps_uri}`,
      b.rating != null && `Avaliação: ${b.rating} (${b.user_rating_count})`, opp && `Oportunidade: ${opp.level} (${opp.score}/100)`,
    ].filter(Boolean).join("\n");
    await copyText(lines);
    toast.success("Informações copiadas");
  };

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <Card className="p-5 animate-slide-up">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex gap-4 min-w-0">
            <ScoreRing score={b.opportunity_score} size={68} />
            <div className="min-w-0">
              <h1 className="heading text-2xl font-semibold text-white">{b.name}</h1>
              <p className="text-sm text-ink-300">{b.category}{b.primary_type_label ? ` · ${b.primary_type_label}` : ""}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <DigitalStatusBadge status={b.digital_status} />
                <OpportunityBadge level={b.opportunity_level} />
                {b.business_status && b.business_status !== "OPERATIONAL" && <Badge className="border-amber-300/30 text-amber-300 bg-amber-300/10">{b.business_status === "CLOSED_TEMPORARILY" ? "Fechado temporariamente" : b.business_status}</Badge>}
                {b.analyzed_at && <Badge>Analisado {fmtDateTime(b.analyzed_at)}</Badge>}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={RefreshCw} loading={audit.isPending} onClick={() => audit.mutate()}>{b.analyzed_at ? "Reanalisar" : "Analisar presença digital"}</Button>
            <Button variant={favorites.has(b.id) ? "danger" : "secondary"} icon={Heart} onClick={() => toggle(b.id)}>{favorites.has(b.id) ? "Favorito" : "Salvar nos favoritos"}</Button>
            <Button variant="ghost" icon={Trash2} onClick={async () => {
              if (!confirm(`Excluir "${b.name}" e todos os dados relacionados (análises, CRM, propostas vinculadas)?`)) return;
              await deleteBusiness(b.id);
              toast.success("Estabelecimento excluído da base");
              qc.invalidateQueries({ queryKey: ["businesses"] });
              nav("/resultados");
            }}>Excluir da base</Button>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-10">
          <a href={b.primary_website ?? undefined} target="_blank" rel="noreferrer" aria-disabled={!b.primary_website}><Button size="sm" variant="secondary" icon={Globe} className="w-full" disabled={!b.primary_website}>Abrir site</Button></a>
          <a href={b.google_maps_uri ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.name + " " + (b.formatted_address ?? ""))}`} target="_blank" rel="noreferrer"><Button size="sm" variant="secondary" icon={MapPin} className="w-full">Google Maps</Button></a>
          <a href={waTarget ? whatsappLink(waTarget) ?? undefined : undefined} target="_blank" rel="noreferrer"><Button size="sm" variant="secondary" icon={MessageCircle} className="w-full" disabled={!waTarget}>WhatsApp</Button></a>
          <a href={b.phone ? `tel:${(b.international_phone ?? b.phone).replace(/[^\d+]/g, "")}` : undefined}><Button size="sm" variant="secondary" icon={Phone} className="w-full" disabled={!b.phone}>Ligar</Button></a>
          <a href={instagram} target="_blank" rel="noreferrer"><Button size="sm" variant="secondary" icon={Instagram} className="w-full" disabled={!instagram}>Instagram</Button></a>
          <Button size="sm" variant="secondary" icon={Copy} onClick={copyInfo}>Copiar dados</Button>
          <a href={mapsRoute(b)} target="_blank" rel="noreferrer"><Button size="sm" variant="secondary" icon={Navigation} className="w-full">Rota</Button></a>
          <Button size="sm" icon={FileText} onClick={() => nav(`/propostas/nova?business=${b.id}`)}>Gerar proposta</Button>
          <Button size="sm" variant="outline" icon={Wand2} onClick={() => nav(`/gerador-sites?business=${b.id}`)}>Gerar site</Button>
          <Button size="sm" variant="outline" icon={Smartphone} onClick={() => nav(`/gerador-sites?business=${b.id}&kind=app`)}>Gerar app</Button>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {/* Dados comerciais públicos */}
          <Card>
            <CardHeader title="Dados comerciais públicos" subtitle={b.osm_url ? <a className="text-lime-400 hover:underline" href={b.osm_url} target="_blank" rel="noreferrer">Fonte: OpenStreetMap ↗</a> : "Fonte: cadastro manual"} icon={Building2} />
            <div className="grid gap-x-8 px-5 pb-5 md:grid-cols-2">
              <div>
                <Row label="Nome comercial">{b.name}</Row>
                <Row label="Categoria">{b.category}</Row>
                <Row label="Endereço">{b.formatted_address}</Row>
                <Row label="Bairro">{b.neighborhood}</Row>
                <Row label="Cidade">{b.city}</Row>
                <Row label="Estado">{b.state}</Row>
                <Row label="CEP">{b.postal_code}</Row>
              </div>
              <div>
                <Row label="Telefone">{b.phone}</Row>
                <Row label="WhatsApp">{whatsapp}</Row>
                <Row label="Site">{b.primary_website ? <a className="text-lime-400 hover:underline" href={b.primary_website} target="_blank" rel="noreferrer">{b.primary_website}</a> : null}</Row>
                <Row label="Instagram">{instagram ? <a className="text-lime-400 hover:underline" href={instagram} target="_blank" rel="noreferrer">{instagram.replace(/^https?:\/\/(www\.)?/, "")}</a> : null}</Row>
                <Row label="Facebook">{facebook ? <a className="text-lime-400 hover:underline" href={facebook} target="_blank" rel="noreferrer">{facebook.replace(/^https?:\/\/(www\.)?/, "")}</a> : null}</Row>
                <Row label="Avaliação pública">{b.rating == null ? <span className="text-ink-500">Não disponível no OpenStreetMap</span> : b.rating != null ? <span className="inline-flex items-center gap-1"><Star className="size-3.5 fill-amber-300 text-amber-300" />{b.rating} · {b.user_rating_count} avaliações</span> : null}</Row>
                <Row label="Coordenadas">{b.lat != null ? `${b.lat.toFixed(6)}, ${b.lng?.toFixed(6)}` : null}</Row>
              </div>
            </div>
            {b.opening_hours?.weekdayDescriptions && (
              <div className="px-5 pb-5">
                <div className="label flex items-center gap-1.5"><Clock className="size-3.5" />Horário de funcionamento</div>
                <div className="grid gap-1 text-xs text-ink-200 sm:grid-cols-2">{b.opening_hours.weekdayDescriptions.map((d) => <span key={d}>{d}</span>)}</div>
              </div>
            )}
          </Card>

          {/* Presença digital */}
          <Card>
            <CardHeader title="Presença digital" subtitle="Instagram, Facebook e diretórios não contam como site próprio" icon={Globe} />
            <div className="px-5 pb-5 space-y-2">
              {sites.length === 0 && <p className="text-sm text-ink-400">Nenhuma presença online registrada{b.analyzed_at ? " nas fontes consultadas" : " — execute a análise"}.</p>}
              <form className="flex gap-2 pb-2" onSubmit={async (e) => {
                e.preventDefault();
                const input = (e.currentTarget.elements.namedItem("site") as HTMLInputElement);
                try {
                  const kind = await setBusinessWebsite(b.id, input.value);
                  input.value = "";
                  await auditBusiness(b.id);
                  toast.success(kind === "own_site" ? "Site adicionado e analisado" : "Link adicionado (rede social/diretório não conta como site próprio)");
                  qc.invalidateQueries({ queryKey: ["business", id] });
                } catch (err) { toast.error(errorMessage(err)); }
              }}>
                <input name="site" className="input" placeholder="Encontrou o site ou Instagram? Cole o link aqui" />
                <Button type="submit" variant="secondary">Adicionar</Button>
              </form>
              {sites.map((s: any) => (
                <div key={s.id} className="flex flex-col gap-1 rounded-xl border border-white/[0.05] bg-white/[0.02] p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <a href={s.url} target="_blank" rel="noreferrer" className="text-sm text-white hover:text-lime-400 break-all inline-flex items-center gap-1">{s.url}<ExternalLink className="size-3" /></a>
                    <div className="text-[11px] text-ink-400">{s.verification_note ?? (s.source === "google_places" ? "Informado no Google" : s.source)}</div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 shrink-0">
                    <Badge className={s.kind === "own_site" ? "border-lime-400/30 text-lime-400 bg-lime-400/10" : undefined}>{KIND_LABEL[s.kind]}</Badge>
                    {s.kind === "own_site" && s.is_online && <Badge className="border-emerald-400/30 text-emerald-400 bg-emerald-400/10">Respondendo</Badge>}
                    {s.kind === "own_site" && s.https != null && <Badge>{s.https ? "HTTPS" : "Sem HTTPS"}</Badge>}
                    {s.kind === "own_site" && s.last_checked_at && s.https === false && <Badge className="border-amber-300/30 text-amber-300 bg-amber-300/10">Sem resposta em HTTPS</Badge>}
                  </div>
                </div>
              ))}
              {contacts.length > 0 && (
                <div className="pt-2 flex flex-wrap gap-1.5">
                  {contacts.map((c: any) => (
                    <a key={c.id} href={c.url ?? undefined} target="_blank" rel="noreferrer" className="chip">
                      {c.type === "instagram" ? <Instagram className="size-3" /> : c.type === "facebook" ? <Facebook className="size-3" /> : c.type === "whatsapp" ? <MessageCircle className="size-3" /> : c.type === "phone" ? <Phone className="size-3" /> : <Globe className="size-3" />}
                      {c.value.replace(/^https?:\/\/(www\.)?/, "").slice(0, 40)}<span className="text-ink-500">· {c.source === "openstreetmap" ? "OSM" : c.source}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </Card>

          {/* Análise do site */}
          <Card>
            <CardHeader title="Análise do site" icon={ScanSearch}
              subtitle={last ? `${last.website_url ?? "Sem site próprio identificado"} · ${fmtDateTime(last.created_at)}` : "Ainda não analisado"} />
            {!last ? (
              <div className="px-5 pb-5"><Button icon={ScanSearch} loading={audit.isPending} onClick={() => audit.mutate()}>Executar investigação automatizada</Button></div>
            ) : (
              <div className="px-5 pb-5">
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {CHECK_ORDER.filter((k) => k in checks).map((k) => (
                    <div key={k} className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/[0.02]">
                      <CheckIcon v={checks[k]?.value} invert={k === "shared_domain"} />
                      <div className="min-w-0">
                        <div className="text-sm text-ink-100">{CHECK_LABELS[k] ?? k}{checks[k]?.value === false && k !== "shared_domain" ? <span className="text-ink-500"> — não identificado</span> : checks[k]?.value == null ? <span className="text-ink-500"> — não verificado</span> : null}</div>
                        {checks[k]?.evidence && <div className="text-[11px] text-ink-400 break-all line-clamp-2">{checks[k].evidence}</div>}
                      </div>
                    </div>
                  ))}
                </div>
                {last.error && <p className="mt-3 flex items-center gap-2 text-xs text-amber-300"><AlertTriangle className="size-3.5" />{last.error}</p>}
              </div>
            )}
          </Card>

          {/* Oportunidades */}
          <Card>
            <CardHeader title="Oportunidades identificadas" icon={Target} subtitle={opp ? `Pontuação ${opp.score}/100 · nível ${opp.level}` : "Execute a análise para classificar"} />
            {opp && (
              <div className="px-5 pb-5 space-y-4">
                <div className="space-y-1.5">
                  {opp.reasons.map((r, i) => (
                    <div key={i} className="flex items-start gap-2.5 text-sm">
                      <Badge className={r.kind === "fact" ? "border-sky-400/30 text-sky-300 bg-sky-400/10" : "border-violet-400/30 text-violet-300 bg-violet-400/10"}>{r.kind === "fact" ? "Fato verificado" : "Estimativa"}</Badge>
                      <span className="text-ink-100">{r.text}</span>
                      {r.weight > 0 && <span className="ml-auto text-xs text-ink-500">+{r.weight}</span>}
                    </div>
                  ))}
                </div>
                {opp.suggested_products.length > 0 && (
                  <div>
                    <div className="label">Soluções recomendadas</div>
                    <div className="flex flex-wrap gap-1.5">{opp.suggested_products.map((p) => <Badge key={p} className="border-lime-400/30 text-lime-400 bg-lime-400/5">{p}</Badge>)}</div>
                  </div>
                )}
              </div>
            )}
          </Card>

          {b.primary_website && last && <ManualChecklist key={last.id} businessId={b.id} url={b.primary_website} checks={checks} onDone={() => { qc.invalidateQueries({ queryKey: ["business", id] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); }} />}
          <MessagePanel business={b} opportunity={opp} phone={waTarget} onSaved={() => qc.invalidateQueries({ queryKey: ["business", id] })} />
        </div>

        <div className="space-y-4">
          <Card className="p-2">
            <MapView businesses={[b]} selectedId={b.id} className="h-64 w-full rounded-xl overflow-hidden" />
          </Card>
          <CrmPanel businessId={b.id} />

          {/* Fontes consultadas */}
          <Card>
            <CardHeader title="Fontes consultadas" icon={Library} />
            <div className="px-5 pb-5 space-y-2">
              {(last?.sources ?? [{ name: "OpenStreetMap", type: "places", result: "Dados públicos do cadastro", at: b.created_at, url: b.osm_url ?? undefined }]).map((s, i) => (
                <div key={i} className="text-xs">
                  <div className="flex items-center gap-1.5 text-ink-100"><ShieldCheck className="size-3.5 text-lime-400" />{s.name}{s.url && <a href={s.url} target="_blank" rel="noreferrer" className="text-lime-400 hover:underline truncate max-w-[180px]">{s.url.replace(/^https?:\/\//, "")}</a>}</div>
                  <div className="text-ink-400 pl-5">{s.result}</div>
                </div>
              ))}
            </div>
          </Card>

          {/* Histórico de pesquisa */}
          <Card>
            <CardHeader title="Histórico de pesquisa" icon={History} />
            <div className="px-5 pb-5 space-y-2 text-xs">
              {searches.map((s: any) => (
                <Link key={s.id} to={`/resultados?search=${s.search_id}`} className="block rounded-lg p-2 hover:bg-white/[0.03]">
                  <div className="text-ink-100">{s.searches?.categories?.join(", ")} — {s.searches?.city}</div>
                  <div className="text-ink-400">{fmtDateTime(s.created_at)} · {s.distance_km} km do centro {s.was_new ? "· novo" : ""}</div>
                </Link>
              ))}
              {audits.map((a) => (
                <div key={a.id} className="rounded-lg p-2 text-ink-400">Análise digital · {fmtDateTime(a.created_at)} · {a.duration_ms ? `${(a.duration_ms / 1000).toFixed(1)}s` : ""}</div>
              ))}
            </div>
          </Card>

          {/* Prompts */}
          <Card>
            <CardHeader title="Prompt personalizado" icon={Sparkles} action={<Link to={`/gerador-sites?business=${b.id}`} className="text-xs text-lime-400 hover:underline">Abrir gerador</Link>} />
            <div className="px-5 pb-5 space-y-1.5">
              {prompts.length === 0 && <p className="text-xs text-ink-400">Nenhum prompt ou mensagem salvo ainda.</p>}
              {prompts.map((p: any) => (
                <button key={p.id} onClick={async () => { await copyText(p.content); toast.success("Conteúdo copiado"); }} className={clsx("w-full text-left rounded-lg p-2 hover:bg-white/[0.03]")}>
                  <div className="text-xs text-ink-100 truncate">{p.title ?? p.kind}</div>
                  <div className="text-[11px] text-ink-400">{fmtDateTime(p.created_at)} · clique para copiar</div>
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
