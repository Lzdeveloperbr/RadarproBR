// Registro de consumo de APIs, rate limiting e logs de atividade.
import type { Ctx } from "./auth.ts";
import { HttpError, env } from "./http.ts";

export type Provider = "google_places" | "google_geocoding" | "openstreetmap" | "web_search" | "anthropic" | "site_fetch";

const DEFAULT_LIMITS: Record<Provider, { perMinute: number; perDay: number }> = {
  google_places: { perMinute: 60, perDay: 3000 },
  google_geocoding: { perMinute: 60, perDay: 1000 },
  openstreetmap: { perMinute: 20, perDay: 2000 },
  web_search: { perMinute: 30, perDay: 1000 },
  anthropic: { perMinute: 20, perDay: 500 },
  site_fetch: { perMinute: 120, perDay: 10000 },
};

export function limitsFor(p: Provider) {
  const key = p.toUpperCase();
  return {
    perMinute: Number(env(`LIMIT_${key}_PER_MINUTE`) ?? DEFAULT_LIMITS[p].perMinute),
    perDay: Number(env(`LIMIT_${key}_PER_DAY`) ?? DEFAULT_LIMITS[p].perDay),
  };
}

export async function enforceRateLimit(ctx: Ctx, provider: Provider, units = 1) {
  const lim = limitsFor(provider);
  const [{ data: minute }, { data: day }] = await Promise.all([
    ctx.sb.rpc("api_usage_count", { p_org: ctx.orgId, p_provider: provider, p_seconds: 60 }),
    ctx.sb.rpc("api_usage_count", { p_org: ctx.orgId, p_provider: provider, p_seconds: 86400 }),
  ]);
  if ((minute ?? 0) + units > lim.perMinute) {
    throw new HttpError(429, `Limite por minuto atingido para ${provider}. Aguarde alguns segundos e tente novamente.`, "rate_limited");
  }
  if ((day ?? 0) + units > lim.perDay) {
    throw new HttpError(429, `Limite diário atingido para ${provider} (${lim.perDay}). Ajuste LIMIT_${provider.toUpperCase()}_PER_DAY se necessário.`, "daily_limit");
  }
}

export async function recordUsage(ctx: Ctx, provider: Provider, endpoint: string, opts: { units?: number; success?: boolean; status?: number; error?: string } = {}) {
  const { error } = await ctx.sb.from("api_usage").insert({
    organization_id: ctx.orgId,
    user_id: ctx.userId,
    provider,
    endpoint,
    units: opts.units ?? 1,
    success: opts.success ?? true,
    status_code: opts.status ?? null,
    error: opts.error?.slice(0, 500) ?? null,
  });
  if (error) console.error("recordUsage", error.message);
}

export async function logActivity(ctx: Ctx, action: string, entity: { type?: string; id?: string } = {}, details: Record<string, unknown> = {}, level: "info" | "warning" | "error" | "alert" = "info") {
  const { error } = await ctx.sb.from("activity_logs").insert({
    organization_id: ctx.orgId,
    user_id: ctx.userId,
    level,
    action,
    entity_type: entity.type ?? null,
    entity_id: entity.id ?? null,
    details,
  });
  if (error) console.error("logActivity", error.message);
}
