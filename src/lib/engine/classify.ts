// Classificação de URLs: site próprio x rede social x diretório x marketplace.
// Instagram, Facebook e páginas de diretório NUNCA contam como site próprio.

export type WebsiteKind = "own_site" | "social" | "directory" | "marketplace" | "unknown";

const SOCIAL = [
  "instagram.com", "facebook.com", "fb.com", "fb.me", "m.facebook.com", "tiktok.com", "youtube.com", "youtu.be",
  "twitter.com", "x.com", "linkedin.com", "pinterest.com", "threads.net", "kwai.com", "linktr.ee", "linktree.com",
  "beacons.ai", "bio.link", "taplink.cc", "wa.me", "whatsapp.com", "api.whatsapp.com", "t.me", "telegram.me",
];

// Diretórios, guias, plataformas de agendamento/avaliação de terceiros e encurtadores
const DIRECTORY = [
  "google.com", "goo.gl", "g.page", "maps.app.goo.gl", "business.site", "yelp.com", "tripadvisor.com",
  "tripadvisor.com.br", "guiamais.com.br", "apontador.com.br", "telelistas.net", "listamais.com.br",
  "solutudo.com.br", "encontrasp.com.br", "cylex.com.br", "infobel.com", "doctoralia.com.br", "boaconsulta.com",
  "booksy.com", "trinks.com", "agendaedu.com", "avec.app", "salaovip.com.br", "reclameaqui.com.br",
  "foursquare.com", "waze.com", "bing.com", "yahoo.com", "econodata.com.br", "cnpj.biz", "cnpj.info",
  "casadosdados.com.br", "empresaqui.com.br", "guiafacil.com", "hagah.com.br", "kekanto.com.br", "restaurantguru.com",
  "zomato.com", "airbnb.com", "airbnb.com.br", "booking.com", "trivago.com.br", "decolar.com", "hoteis.com",
  "expedia.com", "olx.com.br", "webmotors.com.br", "zapimoveis.com.br", "vivareal.com.br", "imovelweb.com.br",
  "sympla.com.br", "calendly.com", "bit.ly", "tinyurl.com", "linkme.bio", "wixsite.com/linkinbio",
];

const MARKETPLACE = [
  "ifood.com.br", "rappi.com.br", "aiqfome.com", "ubereats.com", "99app.com", "mercadolivre.com.br",
  "mercadolibre.com", "shopee.com.br", "amazon.com.br", "magazineluiza.com.br", "magalu.com", "americanas.com.br",
  "elo7.com.br", "enjoei.com.br", "anota.ai", "goomer.app", "menudino.com", "cardapioweb.com", "deliverydireto.com.br",
  "pedidosja.com.br", "neemo.com.br", "instadelivery.com.br",
];

export function hostnameOf(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function matches(host: string, list: string[]): boolean {
  return list.some((d) => {
    const base = d.split("/")[0];
    return host === base || host.endsWith("." + base);
  });
}

export function classifyUrl(raw: string | null | undefined): WebsiteKind {
  if (!raw) return "unknown";
  const host = hostnameOf(raw);
  if (!host) return "unknown";
  if (matches(host, SOCIAL)) return "social";
  if (matches(host, MARKETPLACE)) return "marketplace";
  if (matches(host, DIRECTORY)) return "directory";
  return "own_site";
}

export function socialNetworkOf(raw: string): string | null {
  const host = hostnameOf(raw);
  if (!host) return null;
  if (/(^|\.)instagram\.com$/.test(host)) return "instagram";
  if (/(^|\.)(facebook\.com|fb\.com|fb\.me)$/.test(host)) return "facebook";
  if (/(^|\.)tiktok\.com$/.test(host)) return "tiktok";
  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(host)) return "youtube";
  if (/(^|\.)linkedin\.com$/.test(host)) return "linkedin";
  if (/(^|\.)(twitter\.com|x\.com)$/.test(host)) return "twitter";
  if (/(^|\.)(wa\.me|whatsapp\.com)$/.test(host)) return "whatsapp";
  return null;
}

export const KIND_LABEL: Record<WebsiteKind, string> = {
  own_site: "Site próprio",
  social: "Rede social",
  directory: "Perfil em diretório",
  marketplace: "Página de marketplace",
  unknown: "Site não identificado",
};

/** Normaliza URL vinda do Places/links (adiciona protocolo, remove fragmentos e parâmetros de rastreamento). */
export function normalizeUrl(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = "http://" + s;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    for (const p of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_)/i.test(p)) u.searchParams.delete(p);
    }
    return u.toString();
  } catch {
    return null;
  }
}
