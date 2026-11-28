import { useEffect, useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { municipiosDaUF, populacaoEstimada, findMunicipio } from "../lib/ibge";
import { fmtNumber } from "../lib/format";

/** Campo de cidade com sugestões oficiais do IBGE e população estimada. */
export function CityInput({ uf, value, onChange, placeholder = "Ex.: São José do Rio Preto", showPopulation = true }: { uf: string; value: string; onChange: (v: string) => void; placeholder?: string; showPopulation?: boolean }) {
  const listId = useId();
  const muni = useQuery({ queryKey: ["ibge", uf], enabled: !!uf, staleTime: Infinity, queryFn: () => municipiosDaUF(uf), retry: 1 });
  const match = muni.data ? findMunicipio(muni.data, value) : undefined;
  const [pop, setPop] = useState<{ valor: number; ano: string } | null>(null);
  useEffect(() => {
    let alive = true;
    setPop(null);
    if (match && showPopulation) populacaoEstimada(match.id).then((p) => alive && setPop(p)).catch(() => {});
    return () => { alive = false; };
  }, [match?.id, showPopulation]);
  return (
    <div>
      <input className="input" list={listId} placeholder={uf ? placeholder : "Selecione o estado para ver a lista de cidades"} value={value} onChange={(e) => onChange(e.target.value)} />
      <datalist id={listId}>{(muni.data ?? []).map((m) => <option key={m.id} value={m.nome} />)}</datalist>
      <div className="mt-1 min-h-4 text-[11px] text-ink-400">
        {muni.isLoading && "Carregando cidades do IBGE…"}
        {muni.error && "Lista do IBGE indisponível — digite o nome da cidade."}
        {uf && value && muni.data && !match && "Cidade fora da lista oficial do IBGE — confira a grafia."}
        {pop && <span className="inline-flex items-center gap-1 text-ink-300"><Users className="size-3" />População estimada: {fmtNumber(pop.valor)} hab. (IBGE {pop.ano})</span>}
      </div>
    </div>
  );
}
