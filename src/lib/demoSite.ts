// Gerador de "site demonstração": página única, responsiva e pronta para mostrar ao cliente.
// Usa apenas os dados verificados + o que o vendedor preencher. Nada é inventado: campos vazios somem.
import type { Business } from "./types";
import { segmentOf } from "./engine/scoring";

export interface DemoInput {
  business: Business;
  tagline: string;
  about: string;
  services: { name: string; price: string; desc: string }[];
  whatsapp: string;
  instagram: string;
  color: string;
  heroImage: string;
  ctaLabel: string;
  hours: string[];
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const safeUrl = (u: string) => (/^https?:\/\//i.test(u.trim()) ? esc(u.trim()) : "");

export const SEGMENT_DEFAULTS: Record<string, { color: string; cta: string; tagline: string }> = {
  food: { color: "#e4572e", cta: "Pedir pelo WhatsApp", tagline: "Sabor que você vai querer repetir." },
  booking: { color: "#c9a227", cta: "Agendar pelo WhatsApp", tagline: "Atendimento com hora marcada e qualidade." },
  retail: { color: "#2563eb", cta: "Comprar pelo WhatsApp", tagline: "Variedade e atendimento perto de você." },
  general: { color: "#16a34a", cta: "Falar pelo WhatsApp", tagline: "Atendimento de confiança na sua região." },
};

export function demoDefaults(b: Business, whatsapp?: string | null, instagram?: string | null): DemoInput {
  const seg = SEGMENT_DEFAULTS[segmentOf(b.category, b.primary_type)];
  return {
    business: b, tagline: seg.tagline, about: "", services: [{ name: "", price: "", desc: "" }],
    whatsapp: (whatsapp ?? b.phone ?? "").replace(/\D/g, ""), instagram: instagram ?? "", color: seg.color, heroImage: "", ctaLabel: seg.cta,
    hours: b.opening_hours?.weekdayDescriptions ?? [],
  };
}

export function buildDemoSite(d: DemoInput): string {
  const b = d.business;
  const wa = d.whatsapp.replace(/\D/g, "");
  const waNum = wa ? (wa.length <= 11 ? "55" + wa : wa) : "";
  const waLink = waNum ? `https://wa.me/${waNum}?text=${encodeURIComponent(`Olá! Vim pelo site da ${b.name} e gostaria de mais informações.`)}` : "";
  const services = d.services.filter((s) => s.name.trim());
  const mapSrc = b.lat != null ? `https://maps.google.com/maps?q=${b.lat},${b.lng}&z=16&output=embed` : b.formatted_address ? `https://maps.google.com/maps?q=${encodeURIComponent(b.formatted_address)}&z=16&output=embed` : "";
  const route = b.lat != null ? `https://www.google.com/maps/dir/?api=1&destination=${b.lat},${b.lng}` : "";
  const c = /^#[0-9a-f]{6}$/i.test(d.color) ? d.color : "#16a34a";
  const ig = safeUrl(d.instagram.startsWith("@") ? `https://instagram.com/${d.instagram.slice(1)}` : d.instagram);
  const ld = {
    "@context": "https://schema.org", "@type": "LocalBusiness", name: b.name, telephone: b.phone ?? undefined, url: undefined,
    address: b.formatted_address ? { "@type": "PostalAddress", streetAddress: [b.street, b.street_number].filter(Boolean).join(", ") || undefined, addressLocality: b.city ?? undefined, addressRegion: b.state ?? undefined, postalCode: b.postal_code ?? undefined, addressCountry: "BR" } : undefined,
    geo: b.lat != null ? { "@type": "GeoCoordinates", latitude: b.lat, longitude: b.lng } : undefined,
    sameAs: ig ? [ig] : undefined,
  };
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(b.name)}${b.city ? ` | ${esc(b.category ?? "")} em ${esc(b.city)}` : ""}</title>
<meta name="description" content="${esc(`${b.name}${b.city ? ` em ${b.city}` : ""}. ${d.tagline}`)}" />
<meta property="og:title" content="${esc(b.name)}" />
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>
<style>
:root{--c:${c};--ink:#14161a;--muted:#5b6170;--bg:#fafaf7}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:var(--bg);line-height:1.6}
a{color:inherit}
.wrap{max-width:1080px;margin:0 auto;padding:0 20px}
header{position:sticky;top:0;background:rgba(250,250,247,.9);backdrop-filter:blur(10px);border-bottom:1px solid #0001;z-index:10}
header .wrap{display:flex;align-items:center;justify-content:space-between;height:64px}
.brand{font-weight:800;font-size:1.1rem;letter-spacing:-.02em}
nav a{margin-left:18px;text-decoration:none;color:var(--muted);font-size:.95rem}
nav a:hover{color:var(--c)}
.hero{padding:88px 0 72px;background:${d.heroImage ? `linear-gradient(#0009,#000a),url('${safeUrl(d.heroImage)}') center/cover` : `radial-gradient(1000px 400px at 80% -10%,color-mix(in srgb,var(--c) 30%,transparent),transparent),#101214`};color:#fff}
.hero h1{font-size:clamp(2.2rem,6vw,3.8rem);line-height:1.05;letter-spacing:-.03em;max-width:760px}
.hero p{font-size:1.2rem;opacity:.85;margin:18px 0 30px;max-width:620px}
.btn{display:inline-flex;align-items:center;gap:8px;background:var(--c);color:#fff;padding:14px 22px;border-radius:999px;font-weight:700;text-decoration:none;box-shadow:0 10px 30px -10px var(--c);transition:transform .2s}
.btn:hover{transform:translateY(-2px)}
.btn.ghost{background:transparent;border:1.5px solid #fff6;box-shadow:none;margin-left:10px}
section{padding:72px 0}
h2{font-size:2rem;letter-spacing:-.02em;margin-bottom:24px}
.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.card{background:#fff;border:1px solid #0000000f;border-radius:18px;padding:22px;box-shadow:0 10px 30px -20px #0004}
.card h3{font-size:1.1rem}
.price{color:var(--c);font-weight:800;margin-top:6px}
.muted{color:var(--muted)}
.info{display:grid;gap:24px;grid-template-columns:1fr 1fr}
.map{width:100%;height:340px;border:0;border-radius:18px}
ul.hours{list-style:none}
ul.hours li{padding:6px 0;border-bottom:1px dashed #0002}
footer{background:#101214;color:#fffc;padding:36px 0;font-size:.9rem}
.wa{position:fixed;right:18px;bottom:18px;width:60px;height:60px;border-radius:50%;background:#25d366;display:grid;place-items:center;box-shadow:0 10px 30px -8px #25d366;z-index:20}
.reveal{opacity:0;transform:translateY(16px);transition:all .6s ease}
.reveal.in{opacity:1;transform:none}
@media (max-width:760px){.info{grid-template-columns:1fr}nav{display:none}.btn.ghost{margin:12px 0 0}}
@media (prefers-reduced-motion:reduce){.reveal{opacity:1;transform:none;transition:none}}
</style>
</head>
<body>
<header><div class="wrap"><div class="brand">${esc(b.name)}</div><nav>${services.length ? '<a href="#servicos">Serviços</a>' : ""}${d.about.trim() ? '<a href="#sobre">Sobre</a>' : ""}<a href="#local">Localização</a><a href="#contato">Contato</a></nav></div></header>
<section class="hero"><div class="wrap">
<h1>${esc(b.name)}</h1>
<p>${esc(d.tagline)}${b.city ? ` · ${esc(b.city)}${b.state ? "/" + esc(b.state) : ""}` : ""}</p>
${waLink ? `<a class="btn" href="${waLink}" target="_blank" rel="noopener">${esc(d.ctaLabel)}</a>` : ""}${route ? `<a class="btn ghost" href="${route}" target="_blank" rel="noopener">Como chegar</a>` : ""}
${b.rating != null ? `<p style="margin-top:22px;font-size:1rem">★ ${b.rating} no Google · ${b.user_rating_count} avaliações</p>` : ""}
</div></section>
${services.length ? `<section id="servicos" class="reveal"><div class="wrap"><h2>Serviços</h2><div class="grid">${services.map((s) => `<div class="card"><h3>${esc(s.name)}</h3>${s.desc.trim() ? `<p class="muted">${esc(s.desc)}</p>` : ""}${s.price.trim() ? `<div class="price">${esc(s.price)}</div>` : ""}</div>`).join("")}</div></div></section>` : ""}
${d.about.trim() ? `<section id="sobre" class="reveal" style="background:#fff"><div class="wrap"><h2>Sobre</h2><p class="muted" style="max-width:760px;font-size:1.1rem">${esc(d.about).replace(/\n/g, "<br>")}</p></div></section>` : ""}
<section id="local" class="reveal"><div class="wrap info">
<div><h2>Onde estamos</h2>${b.formatted_address ? `<p>${esc(b.formatted_address)}</p>` : ""}${route ? `<p style="margin-top:16px"><a class="btn" href="${route}" target="_blank" rel="noopener">Abrir rota no mapa</a></p>` : ""}
${d.hours.length ? `<h3 style="margin-top:28px">Horário de funcionamento</h3><ul class="hours">${d.hours.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>` : ""}</div>
${mapSrc ? `<iframe class="map" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="${mapSrc}" title="Mapa"></iframe>` : ""}
</div></section>
<section id="contato" class="reveal" style="background:#fff"><div class="wrap"><h2>Contato</h2><div class="grid">
${b.phone ? `<div class="card"><h3>Telefone</h3><p><a href="tel:${esc(b.phone.replace(/[^\d+]/g, ""))}">${esc(b.phone)}</a></p></div>` : ""}
${waLink ? `<div class="card"><h3>WhatsApp</h3><p><a href="${waLink}" target="_blank" rel="noopener">Enviar mensagem</a></p></div>` : ""}
${ig ? `<div class="card"><h3>Instagram</h3><p><a href="${ig}" target="_blank" rel="noopener">${esc(d.instagram)}</a></p></div>` : ""}
</div></div></section>
<footer><div class="wrap">© ${new Date().getFullYear()} ${esc(b.name)}${b.city ? ` · ${esc(b.city)}` : ""}</div></footer>
${waLink ? `<a class="wa" href="${waLink}" target="_blank" rel="noopener" aria-label="WhatsApp"><svg width="30" height="30" viewBox="0 0 24 24" fill="#fff"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.3-.4.8-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7a2.8 2.8 0 0 0 1.8-1.3 2.3 2.3 0 0 0 .2-1.3c-.1-.1-.2-.2-.4-.3Z"/></svg></a>` : ""}
<script>const io=new IntersectionObserver(e=>e.forEach(x=>x.isIntersecting&&x.target.classList.add("in")),{threshold:.1});document.querySelectorAll(".reveal").forEach(el=>io.observe(el));</script>
</body>
</html>`;
}
