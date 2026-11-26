// Monta a ficha factual do estabelecimento a partir do banco (somente dados verificados/consultados).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export async function buildFactSheet(sb: SupabaseClient, businessId: string) {
  const [{ data: b }, { data: contacts }, { data: sites }, { data: audit }, { data: opp }, { data: locs }] = await Promise.all([
    sb.from("businesses").select("*").eq("id", businessId).maybeSingle(),
    sb.from("business_contacts").select("type, value, source").eq("business_id", businessId),
    sb.from("business_websites").select("url, kind, verified, source, is_online, https").eq("business_id", businessId),
    sb.from("digital_audits").select("checks, location, created_at, website_url").eq("business_id", businessId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("opportunities").select("level, score, reasons, suggested_products").eq("business_id", businessId).maybeSingle(),
    sb.from("business_locations").select("*").eq("business_id", businessId),
  ]);
  if (!b) return null;
  const checks = (audit?.checks ?? {}) as Record<string, { value: boolean | null; evidence?: string }>;
  const yesNo = (k: string) => (checks[k]?.value === true ? "SIM" : checks[k]?.value === false ? "NÃO IDENTIFICADO" : "NÃO VERIFICADO");
  const facts = {
    nome: b.name,
    categoria: b.category,
    tipo_google: b.primary_type_label ?? b.primary_type,
    endereco: b.formatted_address,
    bairro: b.neighborhood,
    cidade: b.city,
    estado: b.state,
    cep: b.postal_code,
    coordenadas: b.lat != null ? `${b.lat}, ${b.lng}` : null,
    telefone: b.phone,
    google_maps: b.google_maps_uri,
    avaliacao: b.rating != null ? `${b.rating} (${b.user_rating_count ?? 0} avaliações)` : null,
    horario_funcionamento: (b.opening_hours as any)?.weekdayDescriptions ?? null,
    site_proprio: b.primary_website ?? "NÃO IDENTIFICADO",
    status_presenca_digital: b.digital_status,
    contatos: (contacts ?? []).map((c) => `${c.type}: ${c.value} (fonte: ${c.source})`),
    presencas_online: (sites ?? []).map((s) => `${s.kind}: ${s.url}${s.verified ? "" : " (correspondência não confirmada)"}`),
    analise_site: audit ? {
      data: audit.created_at,
      online: yesNo("site_online"),
      https: yesNo("https"),
      responsivo_celular: yesNo("mobile_viewport"),
      endereco_no_site: yesNo("address"),
      mapa_incorporado: yesNo("embedded_map"),
      link_google_maps: yesNo("maps_link"),
      botao_como_chegar: yesNo("directions_button"),
      whatsapp: yesNo("whatsapp"),
      formulario_contato: yesNo("contact_form"),
      cardapio_digital: yesNo("digital_menu"),
      agendamento_online: yesNo("online_booking"),
      apresentacao_servicos: yesNo("services"),
      galeria_fotos: yesNo("gallery"),
      redes_sociais_no_site: yesNo("social_links"),
      horario_no_site: yesNo("opening_hours"),
    } : "Análise digital ainda não executada",
    localizacao_extraida_do_site: (locs ?? []).find((l) => l.source === "website") ?? null,
    oportunidade: opp ? { nivel: opp.level, pontuacao: opp.score, motivos: opp.reasons, produtos_sugeridos: opp.suggested_products } : null,
  };
  return { business: b, facts, checks };
}
