// Serviço de pesquisa na web para localizar sites: Brave Search API ou Google Programmable Search (Custom Search JSON API).
import { env, HttpError } from "./http.ts";

export interface WebHit { url: string; title: string; snippet: string }

export function webSearchProvider(): "brave" | "google_cse" | null {
  if (env("BRAVE_SEARCH_API_KEY")) return "brave";
  if (env("GOOGLE_CSE_API_KEY") && env("GOOGLE_CSE_CX")) return "google_cse";
  return null;
}

export async function webSearch(query: string, count = 8): Promise<WebHit[]> {
  const provider = webSearchProvider();
  if (provider === "brave") {
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(count));
    url.searchParams.set("country", "BR");
    url.searchParams.set("search_lang", "pt-br");
    const res = await fetch(url, {
      headers: { "Accept": "application/json", "X-Subscription-Token": env("BRAVE_SEARCH_API_KEY")! },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new HttpError(502, `Brave Search API (${res.status})`, "web_search_error");
    const data = await res.json();
    return (data.web?.results ?? []).map((r: any) => ({ url: r.url, title: r.title ?? "", snippet: r.description ?? "" }));
  }
  if (provider === "google_cse") {
    const url = new URL("https://www.googleapis.com/customsearch/v1");
    url.searchParams.set("key", env("GOOGLE_CSE_API_KEY")!);
    url.searchParams.set("cx", env("GOOGLE_CSE_CX")!);
    url.searchParams.set("q", query);
    url.searchParams.set("num", String(Math.min(10, count)));
    url.searchParams.set("gl", "br");
    url.searchParams.set("lr", "lang_pt");
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new HttpError(502, `Google Custom Search (${res.status})`, "web_search_error");
    const data = await res.json();
    return (data.items ?? []).map((r: any) => ({ url: r.link, title: r.title ?? "", snippet: r.snippet ?? "" }));
  }
  return [];
}
