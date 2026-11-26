// Verificação periódica de disponibilidade dos sites próprios.
// Uso: (a) pelo usuário (JWT) para sua organização; (b) por agendamento (pg_cron) com o cabeçalho x-cron-secret.
import { handler, json, readJson, HttpError, env } from "../_shared/http.ts";
import { requireUser, serviceClient } from "../_shared/auth.ts";
import { safeFetch, robotsAllows } from "../_shared/safeFetch.ts";

Deno.serve(handler(async (req) => {
  const body = await readJson<{ limit?: number; older_than_hours?: number }>(req);
  const limit = Math.min(100, Math.max(1, Number(body.limit) || 30));
  const hours = Number(body.older_than_hours);
  const olderThan = new Date(Date.now() - (Number.isFinite(hours) && hours >= 0 ? hours : 24) * 3600_000).toISOString();

  const cronSecret = env("CRON_SECRET");
  const isCron = !!cronSecret && req.headers.get("x-cron-secret") === cronSecret;
  let sb, orgFilter: string | null = null, userId: string | null = null;
  if (isCron) {
    sb = serviceClient();
  } else {
    const ctx = await requireUser(req);
    sb = ctx.sb;
    orgFilter = ctx.orgId;
    userId = ctx.userId;
  }

  let q = sb.from("business_websites").select("id, organization_id, business_id, url, final_url, is_online")
    .eq("kind", "own_site").eq("is_primary", true)
    .or(`last_checked_at.is.null,last_checked_at.lt.${olderThan}`)
    .order("last_checked_at", { ascending: true, nullsFirst: true }).limit(limit);
  if (orgFilter) q = q.eq("organization_id", orgFilter);
  const { data: sites, error } = await q;
  if (error) throw new HttpError(500, error.message);

  const results: { url: string; online: boolean | null; status: number | null; changed: boolean }[] = [];
  const queue = [...(sites ?? [])];
  const worker = async () => {
    while (queue.length) {
      const s = queue.shift()!;
      const target = s.final_url ?? s.url;
      if (!(await robotsAllows(target))) {
        results.push({ url: target, online: null, status: null, changed: false });
        await sb.from("business_websites").update({ last_checked_at: new Date().toISOString(), error: "Não verificado: robots.txt" }).eq("id", s.id);
        continue;
      }
      const r = await safeFetch(target, { timeoutMs: 10000, maxBytes: 50_000 });
      const changed = s.is_online !== null && s.is_online !== r.ok;
      results.push({ url: target, online: r.ok, status: r.status, changed });
      await sb.from("business_websites").update({ is_online: r.ok, status_code: r.status, response_ms: r.responseMs, last_checked_at: new Date().toISOString(), error: r.error ?? null, https: r.https }).eq("id", s.id);
      await sb.from("businesses").update({ site_online: r.ok, ...(r.ok ? {} : { digital_status: "site_issues" }) }).eq("id", s.business_id);
      await sb.from("api_usage").insert({ organization_id: s.organization_id, user_id: userId, provider: "site_fetch", endpoint: "monitor", success: r.ok, status_code: r.status });
      if (changed) {
        await sb.from("activity_logs").insert({
          organization_id: s.organization_id, user_id: userId, level: r.ok ? "info" : "alert",
          action: r.ok ? "site.back_online" : "site.went_offline", entity_type: "business", entity_id: s.business_id,
          details: { url: target, status: r.status, error: r.error ?? null },
        });
      }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return json(req, { checked: results.length, offline: results.filter((r) => r.online === false).length, changed: results.filter((r) => r.changed).length, results });
}));
