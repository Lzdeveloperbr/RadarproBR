// API pública do IBGE (gratuita, sem chave): municípios por UF e população estimada.
export interface Municipio { id: number; nome: string }

const cacheKey = (uf: string) => `radar.ibge.municipios.${uf}`;

export async function municipiosDaUF(uf: string): Promise<Municipio[]> {
  if (!uf) return [];
  try {
    const cached = localStorage.getItem(cacheKey(uf));
    if (cached) return JSON.parse(cached);
  } catch { /* sem cache */ }
  const res = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${encodeURIComponent(uf)}/municipios?orderBy=nome`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`IBGE respondeu HTTP ${res.status}`);
  const list: Municipio[] = (await res.json()).map((m: any) => ({ id: m.id, nome: m.nome }));
  try { localStorage.setItem(cacheKey(uf), JSON.stringify(list)); } catch { /* cota do localStorage */ }
  return list;
}

/** População estimada mais recente (tabela 6579 do SIDRA/IBGE). */
export async function populacaoEstimada(municipioId: number): Promise<{ valor: number; ano: string } | null> {
  const key = `radar.ibge.pop.${municipioId}`;
  try {
    const c = localStorage.getItem(key);
    if (c) return JSON.parse(c);
  } catch { /* sem cache */ }
  const res = await fetch(`https://servicodados.ibge.gov.br/api/v3/agregados/6579/periodos/-1/variaveis/9324?localidades=N6[${municipioId}]`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) return null;
  const data = await res.json();
  const serie = data?.[0]?.resultados?.[0]?.series?.[0]?.serie ?? {};
  const anos = Object.keys(serie).sort();
  const ano = anos[anos.length - 1];
  const valor = Number(serie[ano]);
  if (!ano || !Number.isFinite(valor)) return null;
  const out = { valor, ano };
  try { localStorage.setItem(key, JSON.stringify(out)); } catch { /* ignora */ }
  return out;
}

export function findMunicipio(list: Municipio[], nome: string): Municipio | undefined {
  const n = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  return list.find((m) => n(m.nome) === n(nome));
}
