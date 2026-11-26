// Busca segura de páginas públicas: validação de URL, resolução DNS com bloqueio de IPs privados (SSRF),
// redirecionamentos revalidados, limite de tamanho, tempo limite e respeito ao robots.txt.
import { validatePublicUrl, isPrivateAddress } from "./netguard.ts";
import { parseRobots, isPathAllowed, BOT_UA_TOKEN } from "./robots.ts";

export const USER_AGENT = `Mozilla/5.0 (compatible; ${BOT_UA_TOKEN}/1.0; +https://radarlocalpro.com.br/bot)`;

export interface FetchResult {
  ok: boolean;
  url: string;          // URL final após redirecionamentos
  status: number | null;
  https: boolean;
  contentType: string | null;
  body: string | null;
  responseMs: number;
  redirects: string[];
  error?: string;
  blockedByRobots?: boolean;
}

async function assertPublicHost(hostname: string) {
  const records: string[] = [];
  for (const type of ["A", "AAAA"] as const) {
    try {
      records.push(...(await Deno.resolveDns(hostname, type)));
    } catch {
      /* sem registros desse tipo */
    }
  }
  if (!records.length) throw new Error("Domínio não resolve (DNS)");
  const bad = records.find(isPrivateAddress);
  if (bad) throw new Error("Domínio aponta para endereço de rede privada — bloqueado (proteção SSRF)");
}

async function readLimited(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      chunks.push(value.slice(0, value.byteLength - (total - maxBytes)));
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
  let o = 0;
  for (const c of chunks) { buf.set(c, o); o += c.byteLength; }
  const ct = res.headers.get("content-type") ?? "";
  const charset = ct.match(/charset=([\w-]+)/i)?.[1]?.toLowerCase();
  try {
    return new TextDecoder(charset && charset !== "utf8" ? charset : "utf-8").decode(buf);
  } catch {
    return new TextDecoder("utf-8").decode(buf);
  }
}

export async function safeFetch(
  rawUrl: string,
  opts: { maxBytes?: number; timeoutMs?: number; method?: "GET" | "HEAD"; maxRedirects?: number } = {},
): Promise<FetchResult> {
  const started = Date.now();
  const redirects: string[] = [];
  let current = rawUrl;
  const maxRedirects = opts.maxRedirects ?? 5;
  try {
    for (let i = 0; i <= maxRedirects; i++) {
      const check = validatePublicUrl(current);
      if (!check.ok) throw new Error(check.reason);
      await assertPublicHost(check.url.hostname);
      const res = await fetch(check.url.toString(), {
        method: opts.method ?? "GET",
        redirect: "manual",
        headers: {
          "User-Agent": USER_AGENT,
          "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
          "Accept-Language": "pt-BR,pt;q=0.9",
        },
        signal: AbortSignal.timeout(opts.timeoutMs ?? 12_000),
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        await res.body?.cancel();
        const next = new URL(res.headers.get("location")!, check.url).toString();
        redirects.push(next);
        current = next;
        continue;
      }
      const contentType = res.headers.get("content-type");
      const isText = !contentType || /text\/|html|xml|json/i.test(contentType);
      const body = opts.method === "HEAD" || !isText ? (await res.body?.cancel(), null) : await readLimited(res, opts.maxBytes ?? 2_500_000);
      return {
        ok: res.status >= 200 && res.status < 400,
        url: current,
        status: res.status,
        https: current.startsWith("https://"),
        contentType,
        body,
        responseMs: Date.now() - started,
        redirects,
      };
    }
    throw new Error("Muitos redirecionamentos");
  } catch (e) {
    const msg = (e as Error).name === "TimeoutError" ? "Tempo limite excedido" : String((e as Error).message ?? e);
    return { ok: false, url: current, status: null, https: current.startsWith("https://"), contentType: null, body: null, responseMs: Date.now() - started, redirects, error: msg.slice(0, 300) };
  }
}

const robotsCache = new Map<string, ReturnType<typeof parseRobots> | null>();

/** Verifica robots.txt do host. Falha ao obter robots.txt = permitido (comportamento padrão da RFC 9309 para 4xx). */
export async function robotsAllows(url: string): Promise<boolean> {
  const u = new URL(url);
  const key = u.origin;
  if (!robotsCache.has(key)) {
    const r = await safeFetch(`${u.origin}/robots.txt`, { maxBytes: 200_000, timeoutMs: 6000 });
    if (r.status && r.status >= 500) {
      robotsCache.set(key, [{ allow: false, pattern: "/" }]); // indisponível: RFC recomenda tratar como bloqueio total
    } else {
      robotsCache.set(key, r.ok && r.body && !/<html/i.test(r.body.slice(0, 500)) ? parseRobots(r.body) : null);
    }
  }
  const rules = robotsCache.get(key);
  return rules ? isPathAllowed(rules, u.pathname + u.search) : true;
}
