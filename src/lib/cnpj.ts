// Consulta de CNPJ na BrasilAPI (gratuita, sem chave, dados públicos da Receita Federal).
// Por LGPD, o quadro de sócios (pessoas físicas) NÃO é armazenado.
import type { CnpjData } from "./types";

export const onlyCnpjDigits = (s: string) => s.replace(/\D/g, "");

export function isValidCnpj(raw: string): boolean {
  const c = onlyCnpjDigits(raw);
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const calc = (len: number) => {
    const w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = w.reduce((n, x, i) => n + x * Number(c[i]), 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(c[12]) && calc(13) === Number(c[13]);
}

export const formatCnpj = (raw: string) => onlyCnpjDigits(raw).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");

export function parseBrasilApi(d: any): CnpjData {
  const phone = d.ddd_telefone_1 ? String(d.ddd_telefone_1).replace(/\D/g, "") : "";
  return {
    cnpj: onlyCnpjDigits(String(d.cnpj ?? "")),
    razao_social: d.razao_social ?? null,
    nome_fantasia: d.nome_fantasia || null,
    situacao: d.descricao_situacao_cadastral ?? null,
    data_abertura: d.data_inicio_atividade ?? null,
    porte: d.porte ?? d.descricao_porte ?? null,
    natureza_juridica: d.natureza_juridica ?? null,
    cnae_principal: d.cnae_fiscal_descricao ? `${d.cnae_fiscal} — ${d.cnae_fiscal_descricao}` : null,
    capital_social: typeof d.capital_social === "number" ? d.capital_social : null,
    endereco: [d.descricao_tipo_de_logradouro, d.logradouro, d.numero, d.complemento, d.bairro].filter(Boolean).join(", ") || null,
    municipio: d.municipio ?? null,
    uf: d.uf ?? null,
    cep: d.cep ? String(d.cep).replace(/^(\d{5})(\d{3})$/, "$1-$2") : null,
    telefone: phone.length >= 10 ? `(${phone.slice(0, 2)}) ${phone.slice(2, -4)}-${phone.slice(-4)}` : null,
    email: d.email ? String(d.email).toLowerCase() : null,
    simples: typeof d.opcao_pelo_simples === "boolean" ? d.opcao_pelo_simples : null,
    mei: typeof d.opcao_pelo_mei === "boolean" ? d.opcao_pelo_mei : null,
    fetched_at: new Date().toISOString(),
  };
}

export async function consultarCnpj(raw: string): Promise<CnpjData> {
  const c = onlyCnpjDigits(raw);
  if (!isValidCnpj(c)) throw new Error("CNPJ inválido (confira os dígitos)");
  let res: Response;
  try {
    res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${c}`, { signal: AbortSignal.timeout(20000) });
  } catch (e) {
    throw new Error("Não foi possível consultar a BrasilAPI: " + (e as Error).message);
  }
  if (res.status === 404) throw new Error("CNPJ não encontrado na Receita Federal");
  if (res.status === 429) throw new Error("Muitas consultas seguidas na BrasilAPI — aguarde um minuto");
  if (!res.ok) throw new Error(`BrasilAPI respondeu HTTP ${res.status}`);
  return parseBrasilApi(await res.json());
}

export function yearsSince(date: string | null): number | null {
  if (!date) return null;
  const d = new Date(date + "T12:00:00");
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (365.25 * 86400_000));
}
