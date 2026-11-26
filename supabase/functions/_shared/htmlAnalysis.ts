// Análise de conteúdo público de páginas HTML para identificar presença digital e localização.
// Regras: cada verificação registra a EVIDÊNCIA encontrada. Ausência de evidência = false (não encontrado),
// nunca uma afirmação de que o recurso não existe em outro lugar.

import { hostnameOf, socialNetworkOf } from "./classify.ts";

export interface Check { value: boolean | null; evidence?: string }

export interface ExtractedLocation {
  full_address: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  lat: number | null;
  lng: number | null;
  maps_link: string | null;
  has_embedded_map: boolean;
  has_directions_button: boolean;
}

export interface PageAnalysis {
  title: string | null;
  description: string | null;
  checks: Record<string, Check>;
  location: ExtractedLocation;
  phones: string[];
  whatsapps: string[];
  emails: string[];
  socials: { network: string; url: string }[];
  internalLinks: { url: string; text: string }[];
  textSample: string;
  textLength: number;
}

export interface BusinessHint { name?: string | null; city?: string | null; state?: string | null; phone?: string | null }

const UF = "AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO";

export function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

export function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|section|footer|header|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? decodeEntities(m[2] ?? m[3] ?? m[4] ?? "") : null;
}

function resolve(href: string, base: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

export function onlyDigits(s: string): string {
  return s.replace(/\D/g, "");
}

/** Extrai coordenadas de links do Google Maps / embeds. */
export function coordsFromMapsUrl(u: string): { lat: number; lng: number } | null {
  const pats = [
    /@(-?\d{1,2}\.\d{2,}),(-?\d{1,3}\.\d{2,})/,
    /[?&](?:q|ll|query|center|destination|daddr)=(-?\d{1,2}\.\d{2,})(?:,|%2C)\s*(-?\d{1,3}\.\d{2,})/i,
    /!3d(-?\d{1,2}\.\d{2,})!4d(-?\d{1,3}\.\d{2,})/,
    /!2d(-?\d{1,3}\.\d{2,})!3d(-?\d{1,2}\.\d{2,})/, // ordem lng, lat em embeds
  ];
  for (let i = 0; i < pats.length; i++) {
    const m = u.match(pats[i]);
    if (m) {
      const [a, b] = [Number(m[1]), Number(m[2])];
      const [lat, lng] = i === 3 ? [b, a] : [a, b];
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
    }
  }
  return null;
}

const MAPS_RE = /(google\.[a-z.]+\/maps|maps\.google\.|goo\.gl\/maps|maps\.app\.goo\.gl|g\.page\/|waze\.com\/(ul|live-map|pt-BR\/live-map)|openstreetmap\.org|mapbox\.com|bing\.com\/maps|apple\.com\/maps|maps\.apple\.com)/i;

function collectJsonLd(html: string): any[] {
  const out: any[] = [];
  const re = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const parsed = JSON.parse(m[1].trim());
      const stack = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (stack.length) {
        const node = stack.shift();
        if (!node || typeof node !== "object") continue;
        out.push(node);
        if (Array.isArray(node["@graph"])) stack.push(...node["@graph"]);
      }
    } catch {
      /* JSON-LD inválido: ignorar */
    }
  }
  return out;
}

export function analyzeHtml(html: string, pageUrl: string, hint: BusinessHint = {}): PageAnalysis {
  const raw = html.slice(0, 3_000_000);
  const text = htmlToText(raw);
  const textNorm = stripAccents(text.toLowerCase());
  const host = hostnameOf(pageUrl);
  const checks: Record<string, Check> = {};

  const title = (raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim();
  const metaTags = raw.match(/<meta\b[^>]*>/gi) ?? [];
  const meta = (name: string) => {
    const t = metaTags.find((tag) => (attr(tag, "name") ?? attr(tag, "property") ?? "").toLowerCase() === name);
    return t ? attr(t, "content") : null;
  };
  const description = meta("description") ?? meta("og:description");

  // ---- Links
  const anchors: { href: string; text: string; tag: string }[] = [];
  const aRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let am: RegExpExecArray | null;
  while ((am = aRe.exec(raw))) {
    const tag = "<a " + am[1] + ">";
    const href = attr(tag, "href");
    if (!href) continue;
    anchors.push({ href, text: htmlToText(am[2]).slice(0, 120), tag });
  }
  const iframes = (raw.match(/<iframe\b[^>]*>/gi) ?? []).map((t) => attr(t, "src") ?? attr(t, "data-src") ?? "").filter(Boolean);

  const absLinks = anchors
    .map((a) => ({ ...a, abs: /^(tel:|mailto:|whatsapp:|sms:)/i.test(a.href) ? a.href : resolve(a.href, pageUrl) }))
    .filter((a): a is typeof a & { abs: string } => !!a.abs);

  // ---- Telefones / WhatsApp / e-mails
  const phones = new Set<string>();
  const whatsapps = new Set<string>();
  const emails = new Set<string>();
  for (const a of absLinks) {
    const h = a.abs;
    if (/^tel:/i.test(h)) {
      const d = onlyDigits(decodeURIComponent(h.slice(4)));
      if (d.length >= 10) phones.add(d);
    } else if (/^mailto:/i.test(h)) {
      const e = decodeURIComponent(h.slice(7).split("?")[0]).trim().toLowerCase();
      if (/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(e)) emails.add(e);
    } else if (/(wa\.me\/|api\.whatsapp\.com\/send|web\.whatsapp\.com\/send|whatsapp:\/\/send|chat\.whatsapp\.com)/i.test(h)) {
      const m = h.match(/wa\.me\/(\+?\d{10,15})/i) ?? h.match(/phone=(\+?\d{10,15})/i);
      whatsapps.add(m ? onlyDigits(m[1]) : h.slice(0, 200));
    }
  }
  const phoneRe = /(?:\+?55\s?)?\(?\b([1-9]{2})\)?[\s.-]?(9?\d{4})[\s.-]?(\d{4})\b/g;
  let pm: RegExpExecArray | null;
  let phoneTextCount = 0;
  while ((pm = phoneRe.exec(text)) && phoneTextCount < 20) {
    phoneTextCount++;
    phones.add(pm[1] + pm[2] + pm[3]);
  }
  if (/whatsapp|zap\b/i.test(text) && whatsapps.size === 0) {
    // menção textual ao WhatsApp, sem link clicável
    checks.whatsapp_text_only = { value: true, evidence: "Menção a WhatsApp no texto, sem link direto" };
  }
  const emailText = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? [];
  emailText.slice(0, 10).forEach((e) => emails.add(e.toLowerCase()));

  // ---- Redes sociais
  const socials: { network: string; url: string }[] = [];
  const seenSocial = new Set<string>();
  for (const a of absLinks) {
    if (!/^https?:/i.test(a.abs)) continue;
    const net = socialNetworkOf(a.abs);
    if (net && net !== "whatsapp") {
      const u = a.abs.split("?")[0].replace(/\/$/, "");
      // ignora links de compartilhamento
      if (/sharer|share\.php|intent\/tweet|\/plugins\//i.test(a.abs)) continue;
      if (!seenSocial.has(u)) {
        seenSocial.add(u);
        socials.push({ network: net, url: u });
      }
    }
  }

  // ---- JSON-LD (schema.org)
  const ld = collectJsonLd(raw);
  let ldAddress: any = null;
  let ldGeo: { lat: number; lng: number } | null = null;
  let ldHours = false;
  let ldMenu = false;
  let ldReserve = false;
  for (const node of ld) {
    if (node.address && !ldAddress) ldAddress = Array.isArray(node.address) ? node.address[0] : node.address;
    const g = node.geo;
    if (g && g.latitude != null && g.longitude != null && !ldGeo) {
      const lat = Number(g.latitude), lng = Number(g.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) ldGeo = { lat, lng };
    }
    if (node.openingHours || node.openingHoursSpecification) ldHours = true;
    if (node.hasMenu || node.menu) ldMenu = true;
    if (node.acceptsReservations === true || node.acceptsReservations === "True" ||
        JSON.stringify(node.potentialAction ?? "").match(/Reserve|Order|Schedule/i)) ldReserve = true;
    if (Array.isArray(node.sameAs)) {
      for (const s of node.sameAs) {
        if (typeof s === "string") {
          const net = socialNetworkOf(s);
          if (net && net !== "whatsapp" && !seenSocial.has(s)) {
            seenSocial.add(s);
            socials.push({ network: net, url: s });
          }
        }
      }
    }
  }

  // ---- Localização
  const mapLinks = absLinks.filter((a) => MAPS_RE.test(a.abs));
  const mapIframes = iframes.filter((s) => MAPS_RE.test(s) || /maps\/embed|output=embed/i.test(s));
  const directions = absLinks.filter((a) =>
    /como\s+chegar|tra[cç]ar\s+rota|ver\s+rota|rotas?\b|dire[cç][oõ]es|get\s+directions|abrir\s+no\s+(mapa|maps|waze)/i.test(a.text) ||
    /\/maps\/dir\/|waze\.com\/ul|navigate=yes|daddr=/i.test(a.abs)
  );

  let coords: { lat: number; lng: number } | null = ldGeo;
  if (!coords) {
    for (const s of [...mapIframes, ...mapLinks.map((m) => m.abs)]) {
      coords = coordsFromMapsUrl(decodeURIComponent(s));
      if (coords) break;
    }
  }
  if (!coords) {
    const geo = meta("geo.position") ?? meta("icbm");
    const m = geo?.match(/(-?\d+\.\d+)[;,\s]+(-?\d+\.\d+)/);
    if (m) coords = { lat: Number(m[1]), lng: Number(m[2]) };
  }

  const cepMatch = text.match(/\b(\d{5})-?(\d{3})\b(?=[^\d]|$)/);
  const cepNearContext = cepMatch && /cep|endere|rua|av\.|avenida|\b(sp|rj|mg|pr|sc|rs|ba|go)\b/i.test(
    text.slice(Math.max(0, (cepMatch.index ?? 0) - 120), (cepMatch.index ?? 0) + 40),
  );
  const postal = ldAddress?.postalCode ? String(ldAddress.postalCode) : cepNearContext ? `${cepMatch![1]}-${cepMatch![2]}` : null;

  const streetRe = new RegExp(
    String.raw`\b(Rua|R\.|Avenida|Av\.?|Rodovia|Rod\.|Travessa|Tv\.|Alameda|Al\.|Pra[çc]a|P[çc]a\.|Estrada|Est\.|Largo|Viela|Via)\s+[A-ZÀ-Ýa-zà-ý0-9º°ª.'\- ]{2,60}?,?\s*(n[º°o.]?\s*)?\d{1,5}[A-Za-z]?\b[^\n]{0,120}`,
  );
  const streetMatch = text.match(streetRe);
  let fullAddress: string | null = null;
  if (ldAddress && typeof ldAddress === "object") {
    fullAddress = [ldAddress.streetAddress, ldAddress.addressLocality, ldAddress.addressRegion, ldAddress.postalCode]
      .filter(Boolean).join(", ") || null;
  } else if (typeof ldAddress === "string") {
    fullAddress = ldAddress;
  }
  if (!fullAddress && streetMatch) fullAddress = streetMatch[0].replace(/\s+/g, " ").trim().slice(0, 200);

  let city: string | null = ldAddress?.addressLocality ?? null;
  let state: string | null = ldAddress?.addressRegion ?? null;
  if (!city && hint.city) {
    const c = stripAccents(hint.city.toLowerCase());
    if (textNorm.includes(c)) city = hint.city;
  }
  if (!state) {
    const sm = text.match(new RegExp(`[-/,]\\s*(${UF})\\b`));
    if (sm) state = sm[1];
  }

  const location: ExtractedLocation = {
    full_address: fullAddress,
    street: streetMatch ? streetMatch[0].split(/[,\n]/)[0].trim().slice(0, 120) : (ldAddress?.streetAddress ?? null),
    city,
    state,
    postal_code: postal,
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
    maps_link: mapLinks[0]?.abs ?? null,
    has_embedded_map: mapIframes.length > 0,
    has_directions_button: directions.length > 0,
  };

  // ---- Verificações de presença digital
  const has = (re: RegExp) => {
    const m = textNorm.match(re);
    return m ? m[0] : null;
  };

  checks.mobile_viewport = metaTags.some((t) => (attr(t, "name") ?? "").toLowerCase() === "viewport" && /width\s*=\s*device-width/i.test(attr(t, "content") ?? ""))
    ? { value: true, evidence: "meta viewport com width=device-width" }
    : { value: false, evidence: "meta viewport responsiva não encontrada" };

  checks.address = fullAddress || postal
    ? { value: true, evidence: (fullAddress ?? `CEP ${postal}`).slice(0, 160) }
    : { value: false };
  checks.postal_code = postal ? { value: true, evidence: postal } : { value: false };
  checks.embedded_map = mapIframes.length ? { value: true, evidence: mapIframes[0].slice(0, 160) } : { value: false };
  checks.maps_link = mapLinks.length ? { value: true, evidence: mapLinks[0].abs.slice(0, 160) } : { value: false };
  checks.directions_button = directions.length ? { value: true, evidence: (directions[0].text || directions[0].abs).slice(0, 120) } : { value: false };
  checks.coordinates = coords ? { value: true, evidence: `${coords.lat}, ${coords.lng}` } : { value: false };

  checks.phone = phones.size ? { value: true, evidence: [...phones][0] } : { value: false };
  checks.whatsapp = whatsapps.size ? { value: true, evidence: [...whatsapps][0] } : { value: false };
  checks.email = emails.size ? { value: true, evidence: [...emails][0] } : { value: false };

  const forms = raw.match(/<form\b[\s\S]*?<\/form>/gi) ?? [];
  const contactForm = forms.find((f) =>
    /<textarea|type\s*=\s*["']?(email|tel)/i.test(f) && !/role\s*=\s*["']search|type\s*=\s*["']search/i.test(f)
  );
  const formEmbed = iframes.find((s) => /forms\.gle|docs\.google\.com\/forms|typeform|jotform|tally\.so|rdstation/i.test(s));
  checks.contact_form = contactForm
    ? { value: true, evidence: "Formulário com campos de contato" }
    : formEmbed
    ? { value: true, evidence: "Formulário incorporado: " + formEmbed.slice(0, 80) }
    : { value: false };

  const menuLink = absLinks.find((a) =>
    /cardapio|card[aá]pio|menu\.pdf|\/menu\b|ifood\.com\.br|goomer|anota\.ai|menudino|cardapioweb|deliverydireto|instadelivery/i.test(stripAccents(a.abs + " " + a.text))
  );
  const menuText = has(/\bcardapio\b|menu digital|nosso menu|\bpratos\b|\bsabores\b/);
  checks.digital_menu = ldMenu
    ? { value: true, evidence: "schema.org hasMenu" }
    : menuLink
    ? { value: true, evidence: (menuLink.text || menuLink.abs).slice(0, 120) }
    : menuText
    ? { value: true, evidence: `Texto: "${menuText}"` }
    : { value: false };

  const bookingLink = absLinks.find((a) =>
    /booksy|trinks|calendly|simplybook|agendor|avec\.app|salaovip|doctoralia|boaconsulta|agendamento|agendar|reserv|setmore|appointy|zenklub|feegow|clinicorp|bestbarbers|appbarber/i.test(stripAccents(a.abs + " " + a.text))
  );
  const bookingText = has(/agende (ja|agora|seu|sua|online)|agendamento online|marque (seu|sua) (horario|consulta|avaliacao)|reserve (ja|agora|sua mesa)|faca sua reserva|agendar horario/);
  checks.online_booking = ldReserve
    ? { value: true, evidence: "schema.org ReserveAction/acceptsReservations" }
    : bookingLink
    ? { value: true, evidence: (bookingLink.text || bookingLink.abs).slice(0, 120) }
    : bookingText
    ? { value: true, evidence: `Texto: "${bookingText}"` }
    : { value: false };

  const servicesText = has(/nossos servicos|servicos oferecidos|\bservicos\b|tratamentos|especialidades|procedimentos|o que fazemos|nossos produtos|solucoes/);
  checks.services = servicesText ? { value: true, evidence: `Seção: "${servicesText}"` } : { value: false };

  const imgCount = (raw.match(/<img\b/gi) ?? []).length;
  const galleryText = has(/galeria|nossas fotos|portfolio|portfólio|nosso espaco|ambiente/);
  checks.gallery = galleryText
    ? { value: true, evidence: `Seção: "${galleryText}" (${imgCount} imagens)` }
    : imgCount >= 10
    ? { value: true, evidence: `${imgCount} imagens na página` }
    : { value: false, evidence: `${imgCount} imagens na página` };

  checks.social_links = socials.length
    ? { value: true, evidence: socials.map((s) => s.network).join(", ") }
    : { value: false };

  const hoursRe = /(horario de (funcionamento|atendimento)|horarios|funcionamento|atendimento)[^\n]{0,80}\d{1,2}\s?(h|:\d{2})|(seg(unda)?|ter(ca)?|sab(ado)?|dom(ingo)?)[^\n]{0,30}\d{1,2}\s?(h|:\d{2})/;
  const hoursText = has(hoursRe);
  checks.opening_hours = ldHours
    ? { value: true, evidence: "schema.org openingHours" }
    : hoursText
    ? { value: true, evidence: `Texto: "${hoursText.slice(0, 100)}"` }
    : { value: false };

  // Nome do estabelecimento presente na página (usado na verificação de correspondência)
  if (hint.name) {
    const tokens = stripAccents(hint.name.toLowerCase()).split(/[^a-z0-9]+/).filter((t) => t.length >= 4 &&
      !["barbearia", "restaurante", "pizzaria", "lanchonete", "padaria", "clinica", "salao", "oficina", "loja", "studio", "academia"].includes(t));
    const found = tokens.filter((t) => textNorm.includes(t) || stripAccents(title.toLowerCase()).includes(t));
    checks.name_match = tokens.length
      ? { value: found.length >= Math.ceil(tokens.length / 2), evidence: `${found.length}/${tokens.length} termos do nome` }
      : { value: null };
  }
  if (hint.phone) {
    const target = onlyDigits(hint.phone).slice(-8);
    checks.phone_match = target.length === 8
      ? { value: [...phones, ...whatsapps].some((p) => p.endsWith(target)), evidence: "comparação dos 8 últimos dígitos" }
      : { value: null };
  }

  const internalLinks = absLinks
    .filter((a) => /^https?:/i.test(a.abs) && hostnameOf(a.abs) === host)
    .map((a) => ({ url: a.abs.split("#")[0], text: a.text }))
    .filter((v, i, arr) => arr.findIndex((x) => x.url === v.url) === i)
    .slice(0, 200);

  return {
    title: title ? decodeEntities(title).slice(0, 200) : null,
    description: description?.slice(0, 300) ?? null,
    checks,
    location,
    phones: [...phones].slice(0, 10),
    whatsapps: [...whatsapps].slice(0, 5),
    emails: [...emails].slice(0, 5),
    socials: socials.slice(0, 12),
    internalLinks,
    textSample: text.slice(0, 4000),
    textLength: text.length,
  };
}

/** Seleciona páginas internas relevantes (contato, localização, cardápio, serviços) para análise complementar. */
export function pickSubpages(links: { url: string; text: string }[], max = 3): string[] {
  const priority = [
    /contato|contact|fale-conosco|fale conosco/i,
    /localiza|onde-estamos|onde estamos|como-chegar|endereco|endereço|unidades/i,
    /cardapio|cardápio|menu/i,
    /servicos|serviços|tratamentos|especialidades|produtos/i,
    /agend|reserv/i,
    /sobre|quem-somos|about/i,
  ];
  const chosen: string[] = [];
  for (const re of priority) {
    const l = links.find((x) => (re.test(x.url) || re.test(x.text)) && !chosen.includes(x.url) && !/\.(pdf|jpg|png|zip)$/i.test(x.url));
    if (l) chosen.push(l.url);
    if (chosen.length >= max) break;
  }
  return chosen;
}

/** Mescla análises de várias páginas do mesmo site (OR lógico entre evidências). */
export function mergeAnalyses(pages: PageAnalysis[]): PageAnalysis {
  const [first, ...rest] = pages;
  const merged: PageAnalysis = structuredClone(first);
  for (const p of rest) {
    for (const [k, c] of Object.entries(p.checks)) {
      if (k === "mobile_viewport") continue; // vale a página inicial
      if (!merged.checks[k] || (merged.checks[k].value !== true && c.value === true)) merged.checks[k] = c;
    }
    const L = merged.location;
    for (const key of Object.keys(p.location) as (keyof ExtractedLocation)[]) {
      const v = p.location[key];
      if ((L[key] === null || L[key] === false) && v !== null && v !== false) (L as any)[key] = v;
    }
    merged.phones = [...new Set([...merged.phones, ...p.phones])].slice(0, 10);
    merged.whatsapps = [...new Set([...merged.whatsapps, ...p.whatsapps])].slice(0, 5);
    merged.emails = [...new Set([...merged.emails, ...p.emails])].slice(0, 5);
    for (const s of p.socials) if (!merged.socials.some((x) => x.url === s.url)) merged.socials.push(s);
  }
  return merged;
}
