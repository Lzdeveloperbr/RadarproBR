// Investigação automatizada de presença digital de um estabelecimento.
// Fontes: Google Places (dados já salvos), pesquisa na web (opcional) e conteúdo público do site (respeitando robots.txt).
import { handler, json, readJson, HttpError } from "../_shared/http.ts";
import { requireUser, type Ctx } from "../_shared/auth.ts";
import { enforceRateLimit, recordUsage, logActivity } from "../_shared/usage.ts";
import { safeFetch, robotsAllows } from "../_shared/safeFetch.ts";
import { analyzeHtml, mergeAnalyses, pickSubpages, stripAccents, type PageAnalysis } from "../_shared/htmlAnalysis.ts";
import { classifyUrl, hostnameOf, normalizeUrl, type WebsiteKind } from "../_shared/classify.ts";
import { computeOpportunity } from "../_shared/scoring.ts";
import { webSearch, webSearchProvider } from "../_shared/websearch.ts";

interface Source { name: string; url?: string; type: string; result: string; at: string }

function nameTokens(name: string) {
  return stripAccents(name.toLowerCase()).split(/[^a-z0-9]+/).filter((t) => t.length >= 4);
}

async function findViaWebSearch(ctx: Ctx, biz: any, sources: Source[]) {
  const q = `"${biz.name}" ${biz.city ?? ""} ${biz.state ?? ""}`.trim();
  await enforceRateLimit(ctx, "web_search");
  let hits;
  try {
    hits = await webSearch(q, 8);
    await recordUsage(ctx, "web_search", webSearchProvider() ?? "none");
  } catch (e) {
    await recordUsage(ctx, "web_search", webSearchProvider() ?? "none", { success: false, error: String((e as Error).message) });
    sources.push({ name: "Pesquisa na web", type: "web_search", result: "Falha: " + (e as Error).message, at: new Date().toISOString() });
    return [];
  }
  sources.push({ name: `Pesquisa na web (${webSearchProvider()})`, type: "web_search", result: `${hits.length} resultados para ${q}`, at: new Date().toISOString() });
  const tokens = nameTokens(biz.name);
  return hits.map((h) => {
    const url = normalizeUrl(h.url);
    const kind = url ? classifyUrl(url) : "unknown";
    const t = stripAccents((h.title + " " + h.snippet).toLowerCase());
    const matched = tokens.filter((x) => t.includes(x)).length;
    return { url, kind, title: h.title, nameScore: tokens.length ? matched / tokens.length : 0 };
  }).filter((h) => h.url);
}

Deno.serve(handler(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "Método não permitido");
  const ctx = await requireUser(req);
  const body = await readJson<{ business_id: string; use_web_search?: boolean }>(req);
  if (!body.business_id || !/^[0-9a-f-]{36}$/i.test(body.business_id)) throw new HttpError(400, "business_id inválido");
  const started = Date.now();

  const { data: biz, error } = await ctx.sb.from("businesses").select("*").eq("id", body.business_id).maybeSingle();
  if (error || !biz) throw new HttpError(404, "Estabelecimento não encontrado");
  const { data: settings } = await ctx.sb.from("user_settings").select("use_web_search, alert_min_score").eq("user_id", ctx.userId).maybeSingle();
  const useWeb = (body.use_web_search ?? settings?.use_web_search ?? true) && !!webSearchProvider();

  const now = () => new Date().toISOString();
  const isOsm = biz.source === "openstreetmap";
  const sourceName = isOsm ? "OpenStreetMap" : "Google Places";
  const sources: Source[] = [{
    name: sourceName, url: isOsm ? (biz.raw?.osm_url ?? undefined) : (biz.google_maps_uri ?? undefined), type: "places",
    result: biz.places_website_uri ? `Site informado: ${biz.places_website_uri}` : "Nenhum site informado no cadastro", at: biz.updated_at,
  }];

  const { data: sites } = await ctx.sb.from("business_websites").select("*").eq("business_id", biz.id);
  const websites = [...(sites ?? [])];

  // 1) Site próprio: preferir verificado/primário; senão buscar na web
  let own = websites.find((w) => w.kind === "own_site" && w.is_primary) ?? websites.find((w) => w.kind === "own_site" && w.verified);
  let webSearchUsed = false;
  const candidates: { url: string; kind: WebsiteKind; nameScore: number; title: string }[] = [];

  if (!own && useWeb) {
    webSearchUsed = true;
    const hits = await findViaWebSearch(ctx, biz, sources);
    for (const h of hits) candidates.push(h as any);
  }

  // Verifica candidatos de site próprio encontrados na web: precisa conter o nome E (telefone OU cidade)
  let ownAnalysis: PageAnalysis | null = null;
  let ownFetch: Awaited<ReturnType<typeof safeFetch>> | null = null;
  let robotsBlocked = false;

  for (const c of candidates.filter((c) => c.kind === "own_site").slice(0, 3)) {
    const dupe = websites.find((w) => w.url === c.url);
    if (dupe) continue;
    await enforceRateLimit(ctx, "site_fetch");
    if (!(await robotsAllows(c.url))) {
      sources.push({ name: "Candidato a site", url: c.url, type: "website", result: "Bloqueado por robots.txt — não verificado", at: now() });
      continue;
    }
    const r = await safeFetch(c.url);
    await recordUsage(ctx, "site_fetch", "candidate", { success: r.ok, status: r.status ?? undefined });
    if (!r.ok || !r.body) continue;
    const a = analyzeHtml(r.body, r.url, { name: biz.name, city: biz.city, phone: biz.phone });
    const nameOk = a.checks.name_match?.value === true;
    const phoneOk = a.checks.phone_match?.value === true;
    const cityOk = biz.city ? stripAccents(a.textSample.toLowerCase()).includes(stripAccents(biz.city.toLowerCase())) : false;
    const verified = nameOk && (phoneOk || cityOk);
    sources.push({ name: "Candidato a site", url: c.url, type: "website", result: verified ? "Correspondência confirmada (nome + telefone/cidade)" : "Correspondência não confirmada", at: now() });
    const { data: saved } = await ctx.sb.from("business_websites").upsert({
      organization_id: ctx.orgId, business_id: biz.id, url: c.url, final_url: r.url, domain: hostnameOf(r.url), kind: "own_site",
      source: "web_search", verified, verification_note: verified ? `Nome${phoneOk ? " e telefone" : " e cidade"} encontrados na página` : "Nome/telefone não confirmados na página",
      is_primary: verified, status_code: r.status, is_online: r.ok, https: r.https, response_ms: r.responseMs, last_checked_at: now(),
    }, { onConflict: "business_id,url" }).select().single();
    if (saved) websites.push(saved);
    if (verified && saved) {
      own = saved;
      ownFetch = r;
      ownAnalysis = a;
      break;
    }
  }
  // Presenças em redes sociais/diretórios encontradas na web (prováveis quando o nome confere)
  for (const c of candidates.filter((c) => c.kind !== "own_site" && c.nameScore >= 0.5).slice(0, 6)) {
    if (websites.some((w) => w.url === c.url)) continue;
    const { data: saved } = await ctx.sb.from("business_websites").upsert({
      organization_id: ctx.orgId, business_id: biz.id, url: c.url, domain: hostnameOf(c.url), kind: c.kind, source: "web_search",
      verified: false, verification_note: `Nome compatível no título do resultado (${Math.round(c.nameScore * 100)}%)`, is_primary: false,
    }, { onConflict: "business_id,url" }).select().single();
    if (saved) websites.push(saved);
  }

  // 2) Análise do site próprio
  let pagesAnalyzed = 0;
  if (own && !ownAnalysis) {
    await enforceRateLimit(ctx, "site_fetch");
    if (!(await robotsAllows(own.url))) {
      robotsBlocked = true;
      sources.push({ name: "Site próprio", url: own.url, type: "website", result: "Acesso automatizado não permitido pelo robots.txt — conteúdo não analisado", at: now() });
      // Checagem de disponibilidade (HEAD) é permitida mesmo assim? Não: respeitamos o robots.txt integralmente.
    } else {
      ownFetch = await safeFetch(own.url);
      await recordUsage(ctx, "site_fetch", "home", { success: ownFetch.ok, status: ownFetch.status ?? undefined, error: ownFetch.error });
      if (ownFetch.ok && ownFetch.body) ownAnalysis = analyzeHtml(ownFetch.body, ownFetch.url, { name: biz.name, city: biz.city, phone: biz.phone });
      sources.push({ name: "Site próprio", url: own.url, type: "website", result: ownFetch.ok ? `HTTP ${ownFetch.status} em ${ownFetch.responseMs} ms` : `Falha: ${ownFetch.error ?? "HTTP " + ownFetch.status}`, at: now() });
      // Se HTTP falhou, tentar HTTPS (e vice-versa) antes de concluir que está fora do ar
      if (!ownFetch.ok && own.url.startsWith("http://")) {
        const alt = await safeFetch(own.url.replace(/^http:/, "https:"));
        if (alt.ok) {
          ownFetch = alt;
          if (alt.body) ownAnalysis = analyzeHtml(alt.body, alt.url, { name: biz.name, city: biz.city, phone: biz.phone });
        }
      }
    }
  }
  if (ownAnalysis && ownFetch) {
    pagesAnalyzed = 1;
    const pages = [ownAnalysis];
    for (const sub of pickSubpages(ownAnalysis.internalLinks, 3)) {
      if (!(await robotsAllows(sub))) continue;
      const r = await safeFetch(sub, { timeoutMs: 8000 });
      await recordUsage(ctx, "site_fetch", "subpage", { success: r.ok, status: r.status ?? undefined });
      if (r.ok && r.body) {
        pages.push(analyzeHtml(r.body, r.url, { name: biz.name, city: biz.city, phone: biz.phone }));
        sources.push({ name: "Página interna", url: r.url, type: "website", result: `HTTP ${r.status}`, at: now() });
        pagesAnalyzed++;
      }
    }
    ownAnalysis = mergeAnalyses(pages);
  }

  if (own && ownFetch) {
    // HTTPS: redireciona/serve em https? Se o site final é http, testa se https responde
    let https = ownFetch.https;
    if (!https && ownFetch.ok) {
      const t = await safeFetch(ownFetch.url.replace(/^http:/, "https:"), { method: "HEAD", timeoutMs: 6000 });
      https = false; // servir conteúdo em HTTP sem redirecionar para HTTPS conta como sem HTTPS
      if (t.ok) sources.push({ name: "Teste HTTPS", url: t.url, type: "website", result: "HTTPS disponível, mas o site não redireciona automaticamente", at: now() });
    }
    await ctx.sb.from("business_websites").update({
      final_url: ownFetch.url, domain: hostnameOf(ownFetch.url), status_code: ownFetch.status, is_online: ownFetch.ok, https,
      response_ms: ownFetch.responseMs, last_checked_at: now(), error: ownFetch.error ?? null,
    }).eq("id", own.id);
    own = { ...own, is_online: ownFetch.ok, https, final_url: ownFetch.url };
  }

  // 3) Consolida verificações
  const checks: Record<string, { value: boolean | null; evidence?: string }> = {};
  checks.own_site = own ? { value: true, evidence: own.url } : { value: webSearchUsed ? false : null, evidence: webSearchUsed ? `Não identificado no ${sourceName} nem na pesquisa na web` : `Não identificado no ${sourceName}` };
  checks.site_online = own ? { value: robotsBlocked ? null : (own.is_online ?? null), evidence: ownFetch ? (ownFetch.ok ? `HTTP ${ownFetch.status}` : ownFetch.error ?? `HTTP ${ownFetch.status}`) : robotsBlocked ? "Não verificado (robots.txt)" : undefined } : { value: null };
  checks.https = own && ownFetch ? { value: own.https ?? null, evidence: own.final_url } : { value: null };
  if (ownAnalysis) Object.assign(checks, ownAnalysis.checks);
  if (own?.domain) {
    const { count } = await ctx.sb.from("business_websites").select("business_id", { count: "exact", head: true })
      .eq("organization_id", ctx.orgId).eq("domain", own.domain).neq("business_id", biz.id).eq("kind", "own_site");
    checks.shared_domain = { value: (count ?? 0) > 0, evidence: count ? `Domínio usado por mais ${count} estabelecimento(s)` : undefined };
  }
  // Telefone e horário também podem vir do Google
  if (!checks.phone?.value && biz.phone) checks.phone_places = { value: true, evidence: biz.phone };
  if (biz.opening_hours) checks.hours_places = { value: true, evidence: `Horário publicado no ${sourceName}` };

  // 4) Contatos e presenças
  const contactRows: any[] = [];
  const add = (type: string, value: string, url: string | null, source: string) =>
    contactRows.push({ organization_id: ctx.orgId, business_id: biz.id, type, value: value.slice(0, 300), url, source });
  if (ownAnalysis) {
    ownAnalysis.whatsapps.forEach((w) => add("whatsapp", w, /^\d+$/.test(w) ? `https://wa.me/${w.length <= 11 ? "55" + w : w}` : w, "website"));
    ownAnalysis.emails.forEach((e) => add("email", e, `mailto:${e}`, "website"));
    ownAnalysis.phones.slice(0, 3).forEach((p) => add("phone", p, `tel:+55${p}`, "website"));
    ownAnalysis.socials.forEach((s) => add(s.network, s.url, s.url, "website"));
  }
  for (const w of websites.filter((w) => w.kind === "social")) {
    const net = /instagram/i.test(w.url) ? "instagram" : /facebook|fb\./i.test(w.url) ? "facebook" : /tiktok/i.test(w.url) ? "tiktok" : /youtube/i.test(w.url) ? "youtube" : /linkedin/i.test(w.url) ? "linkedin" : "other";
    add(net, w.url, w.url, w.source);
  }
  if (contactRows.length) await ctx.sb.from("business_contacts").upsert(contactRows, { onConflict: "business_id,type,value", ignoreDuplicates: true });

  if (ownAnalysis) {
    const L = ownAnalysis.location;
    await ctx.sb.from("business_locations").upsert({
      organization_id: ctx.orgId, business_id: biz.id, source: "website", full_address: L.full_address, street: L.street, city: L.city,
      state: L.state, postal_code: L.postal_code, lat: L.lat, lng: L.lng, maps_link: L.maps_link,
      has_embedded_map: L.has_embedded_map, has_directions_button: L.has_directions_button,
    }, { onConflict: "business_id,source" });
  }

  const { data: allContacts } = await ctx.sb.from("business_contacts").select("type").eq("business_id", biz.id);
  const types = new Set((allContacts ?? []).map((c) => c.type));

  // 5) Pontuação de oportunidade
  const result = computeOpportunity({
    category: biz.category,
    primaryType: biz.primary_type,
    investigated: true,
    webSearchUsed,
    ownSite: own ? { url: own.url, online: robotsBlocked ? null : (own.is_online ?? null), https: own.https ?? null, robotsBlocked } : null,
    otherPresence: websites.filter((w) => w.kind !== "own_site" && w.kind !== "unknown").map((w) => ({ kind: w.kind, url: w.url })),
    checks,
    hasPhone: !!biz.phone || types.has("phone"),
    rating: biz.rating,
    ratingCount: biz.user_rating_count,
    sourceName,
  });
  if (!webSearchUsed && !own) {
    result.reasons.push({ kind: "fact", text: `Pesquisa na web não configurada/desativada: status "site não identificado" baseado apenas no ${sourceName}`, weight: 0 });
  }

  const hasLocation = ownAnalysis ? !!(ownAnalysis.checks.address?.value || ownAnalysis.checks.embedded_map?.value || ownAnalysis.checks.maps_link?.value) : null;
  const status = !own && !webSearchUsed ? "no_site" : result.status;

  const { data: audit } = await ctx.sb.from("digital_audits").insert({
    organization_id: ctx.orgId, business_id: biz.id, website_id: own?.id ?? null, user_id: ctx.userId,
    status: own && !ownAnalysis ? "partial" : "completed", website_url: own?.final_url ?? own?.url ?? null,
    website_kind: own ? "own_site" : (websites.find((w) => w.kind !== "unknown")?.kind ?? "unknown"),
    checks, location: ownAnalysis?.location ?? null, sources, robots_allowed: own ? !robotsBlocked : null,
    pages_analyzed: pagesAnalyzed, duration_ms: Date.now() - started,
    error: ownFetch && !ownFetch.ok ? ownFetch.error ?? `HTTP ${ownFetch.status}` : null,
  }).select().single();

  await ctx.sb.from("opportunities").upsert({
    organization_id: ctx.orgId, business_id: biz.id, level: result.level, score: result.score, reasons: result.reasons,
    suggested_products: result.products, updated_at: now(),
  }, { onConflict: "business_id" });

  const instagram = types.has("instagram");
  await ctx.sb.from("businesses").update({
    digital_status: status,
    primary_website: own?.final_url ?? own?.url ?? null,
    has_own_site: own ? true : webSearchUsed ? false : false,
    site_online: own ? (robotsBlocked ? null : own.is_online ?? null) : null,
    site_https: own ? own.https ?? null : null,
    site_has_location: hasLocation,
    site_mobile_ready: ownAnalysis ? ownAnalysis.checks.mobile_viewport?.value ?? null : null,
    has_whatsapp: types.has("whatsapp"),
    has_instagram: instagram,
    has_facebook: types.has("facebook"),
    has_booking: ownAnalysis ? ownAnalysis.checks.online_booking?.value ?? false : false,
    has_menu: ownAnalysis ? ownAnalysis.checks.digital_menu?.value ?? false : false,
    opportunity_level: result.level,
    opportunity_score: result.score,
    analyzed_at: now(),
  }).eq("id", biz.id);

  // Lead: avança status automático apenas nas fases iniciais
  const { data: lead } = await ctx.sb.from("leads").select("id, status").eq("business_id", biz.id).maybeSingle();
  const nextStatus = result.level === "baixa" ? "analisado" : "oportunidade";
  if (!lead) {
    await ctx.sb.from("leads").insert({ organization_id: ctx.orgId, business_id: biz.id, status: nextStatus });
  } else if (["novo", "nao_analisado", "analisado", "oportunidade"].includes(lead.status) && lead.status !== nextStatus) {
    await ctx.sb.from("leads").update({ status: nextStatus }).eq("id", lead.id);
  }

  const alertMin = settings?.alert_min_score ?? 70;
  if (result.score >= alertMin) {
    await logActivity(ctx, "opportunity.alert", { type: "business", id: biz.id }, { name: biz.name, score: result.score, level: result.level }, "alert");
  }
  await logActivity(ctx, "audit.completed", { type: "business", id: biz.id }, { name: biz.name, score: result.score, status });

  return json(req, { audit, opportunity: result, status, has_own_site: !!own, web_search_used: webSearchUsed });
}));
