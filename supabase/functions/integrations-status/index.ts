// Status real das integrações (sem simulação): verifica segredos configurados e, opcionalmente, testa as APIs.
import Anthropic from "npm:@anthropic-ai/sdk";
import { handler, json, env } from "../_shared/http.ts";
import { requireUser } from "../_shared/auth.ts";
import { limitsFor, type Provider } from "../_shared/usage.ts";
import { webSearchProvider } from "../_shared/websearch.ts";
import { AI_MODEL } from "../_shared/ai.ts";
import { OSM_USER_AGENT } from "../_shared/osm.ts";

type State = "connected" | "pending" | "auth_error" | "limit" | "error" | "configured";

async function testGoogle(): Promise<{ state: State; message: string }> {
  const key = env("GOOGLE_MAPS_API_KEY") ?? env("GOOGLE_PLACES_API_KEY");
  if (!key) return { state: "pending", message: "Segredo GOOGLE_MAPS_API_KEY não definido" };
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.id" },
    body: JSON.stringify({ textQuery: "praça da sé São Paulo", pageSize: 1 }),
    signal: AbortSignal.timeout(10000),
  });
  if (res.ok) return { state: "connected", message: "Places API (New) respondeu com sucesso" };
  const data = await res.json().catch(() => ({}));
  const msg = data?.error?.message ?? res.statusText;
  if (res.status === 429) return { state: "limit", message: msg };
  if (res.status === 401 || res.status === 403) return { state: "auth_error", message: msg };
  return { state: "error", message: `HTTP ${res.status}: ${msg}` };
}

async function testGeocoding(): Promise<{ state: State; message: string }> {
  const key = env("GOOGLE_MAPS_API_KEY") ?? env("GOOGLE_PLACES_API_KEY");
  if (!key) return { state: "pending", message: "Segredo GOOGLE_MAPS_API_KEY não definido" };
  const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=Brasilia&key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(10000) });
  const d = await r.json().catch(() => ({}));
  if (d.status === "OK") return { state: "connected", message: "Geocoding API respondeu com sucesso" };
  if (d.status === "OVER_QUERY_LIMIT") return { state: "limit", message: d.error_message ?? d.status };
  if (d.status === "REQUEST_DENIED") return { state: "auth_error", message: d.error_message ?? "Requisição negada — habilite a Geocoding API para a chave" };
  return { state: "error", message: d.error_message ?? d.status ?? `HTTP ${r.status}` };
}

async function testWebSearch(): Promise<{ state: State; message: string }> {
  const p = webSearchProvider();
  if (!p) return { state: "pending", message: "Defina BRAVE_SEARCH_API_KEY ou GOOGLE_CSE_API_KEY + GOOGLE_CSE_CX" };
  if (p === "brave") {
    const r = await fetch("https://api.search.brave.com/res/v1/web/search?q=teste&count=1", { headers: { "X-Subscription-Token": env("BRAVE_SEARCH_API_KEY")!, Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
    if (r.ok) return { state: "connected", message: "Brave Search API respondeu com sucesso" };
    return { state: r.status === 429 ? "limit" : r.status === 401 || r.status === 403 || r.status === 422 ? "auth_error" : "error", message: `HTTP ${r.status}` };
  }
  const r = await fetch(`https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(env("GOOGLE_CSE_API_KEY")!)}&cx=${encodeURIComponent(env("GOOGLE_CSE_CX")!)}&q=teste&num=1`, { signal: AbortSignal.timeout(10000) });
  if (r.ok) return { state: "connected", message: "Google Custom Search respondeu com sucesso" };
  return { state: r.status === 429 ? "limit" : r.status === 400 || r.status === 403 ? "auth_error" : "error", message: `HTTP ${r.status}` };
}

async function testOsm(): Promise<{ state: State; message: string }> {
  const r = await fetch("https://nominatim.openstreetmap.org/search?q=Votuporanga&format=jsonv2&limit=1&countrycodes=br", { headers: { "User-Agent": OSM_USER_AGENT }, signal: AbortSignal.timeout(10000) });
  if (r.ok) return { state: "connected", message: "OpenStreetMap (Nominatim/Overpass) respondeu com sucesso — gratuito, sem chave" };
  return { state: r.status === 429 ? "limit" : "error", message: `HTTP ${r.status}` };
}

async function testAI(): Promise<{ state: State; message: string }> {
  if (!env("ANTHROPIC_API_KEY")) return { state: "pending", message: "Segredo ANTHROPIC_API_KEY não definido" };
  try {
    const client = new Anthropic({ apiKey: env("ANTHROPIC_API_KEY") });
    const m = await client.models.retrieve(AI_MODEL);
    return { state: "connected", message: `Modelo ${m.id} disponível` };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return { state: "auth_error", message: "Chave inválida" };
    if (e instanceof Anthropic.RateLimitError) return { state: "limit", message: "Limite atingido" };
    if (e instanceof Anthropic.NotFoundError) return { state: "error", message: `Modelo ${AI_MODEL} não encontrado para esta chave` };
    return { state: "error", message: String((e as Error).message) };
  }
}

Deno.serve(handler(async (req) => {
  const ctx = await requireUser(req);
  const url = new URL(req.url);
  const test = url.searchParams.get("test") === "1";

  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const today = new Date(Date.now() - 86400_000).toISOString();
  const { data: usage } = await ctx.sb.from("api_usage").select("provider, units, success, created_at").eq("organization_id", ctx.orgId).gte("created_at", since).limit(50000);
  const agg = (p: Provider) => {
    const rows = (usage ?? []).filter((u) => u.provider === p);
    return {
      last30d: rows.reduce((n, r) => n + r.units, 0),
      last24h: rows.filter((r) => r.created_at >= today).reduce((n, r) => n + r.units, 0),
      errors30d: rows.filter((r) => !r.success).length,
      limits: limitsFor(p),
    };
  };

  const configured = {
    google: !!(env("GOOGLE_MAPS_API_KEY") ?? env("GOOGLE_PLACES_API_KEY")),
    web: !!webSearchProvider(),
    ai: !!env("ANTHROPIC_API_KEY"),
  };
  const base = (ok: boolean, missing: string) => ({ state: (ok ? "configured" : "pending") as State, message: ok ? "Segredo configurado (clique em Testar para validar)" : missing });

  const hasGoogle = configured.google;
  const pref = (env("SEARCH_PROVIDER") ?? "auto").toLowerCase();
  const activeSource = pref === "osm" || (pref === "auto" && !hasGoogle) ? "osm" : "google";
  const osm = test ? await testOsm().catch((e) => ({ state: "error" as State, message: String(e?.message ?? e) }))
    : { state: "connected" as State, message: "Fonte gratuita, sem chave: Overpass API + Nominatim" };
  const [places, geocoding, web, ai] = test
    ? await Promise.all([testGoogle(), testGeocoding(), testWebSearch(), testAI()].map((p) => p.catch((e) => ({ state: "error" as State, message: String(e?.message ?? e) }))))
    : [base(configured.google, "Segredo GOOGLE_MAPS_API_KEY não definido"), base(configured.google, "Segredo GOOGLE_MAPS_API_KEY não definido"), base(configured.web, "Defina BRAVE_SEARCH_API_KEY ou GOOGLE_CSE_API_KEY + GOOGLE_CSE_CX"), base(configured.ai, "Segredo ANTHROPIC_API_KEY não definido")];

  return json(req, {
    tested: test,
    active_source: activeSource,
    integrations: {
      openstreetmap: { ...osm, active: activeSource === "osm", usage: agg("openstreetmap") },
      google_places: { ...places, active: activeSource === "google", usage: agg("google_places") },
      google_geocoding: { ...geocoding, usage: agg("google_geocoding") },
      web_search: { ...web, provider: webSearchProvider(), usage: agg("web_search") },
      anthropic: { ...ai, model: AI_MODEL, usage: agg("anthropic") },
      site_fetch: { state: "connected", message: "Análise de páginas públicas executada nas Edge Functions (com proteção SSRF e robots.txt)", usage: agg("site_fetch") },
      supabase: { state: "connected", message: "Banco de dados, autenticação e Edge Functions ativos" },
    },
  });
}));
