import { useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { GitCompare, CheckCircle2, XCircle, HelpCircle } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { fetchBusinesses } from "../lib/filters";
import { Card, EmptyState, PageHeader, PageLoader, ScoreRing } from "../components/ui";
import { BusinessPicker } from "../components/BusinessPicker";
import { DigitalStatusBadge } from "../components/ui/StatusBadges";
import type { Business } from "../lib/types";

const ROWS: [string, (b: Business) => React.ReactNode][] = [
  ["Categoria", (b) => b.category],
  ["Cidade", (b) => [b.neighborhood, b.city].filter(Boolean).join(", ")],
  ["Presença digital", (b) => <DigitalStatusBadge status={b.digital_status} />],
  ["Avaliação", (b) => (b.rating != null ? `${b.rating}★ (${b.user_rating_count})` : null)],
  ["Telefone", (b) => b.phone],
  ["Site próprio", (b) => b.has_own_site],
  ["Site online", (b) => b.site_online],
  ["HTTPS", (b) => b.site_https],
  ["Preparado p/ celular", (b) => b.site_mobile_ready],
  ["Localização no site", (b) => b.site_has_location],
  ["WhatsApp", (b) => b.has_whatsapp],
  ["Instagram", (b) => b.has_instagram],
  ["Agendamento online", (b) => b.has_booking],
  ["Cardápio digital", (b) => b.has_menu],
];

function Val({ v }: { v: React.ReactNode }) {
  if (v === true) return <CheckCircle2 className="size-4 text-lime-400 mx-auto" />;
  if (v === false) return <XCircle className="size-4 text-rose-400 mx-auto" />;
  if (v == null || v === "") return <HelpCircle className="size-4 text-ink-500 mx-auto" />;
  return <>{v}</>;
}

export function ComparePage() {
  const { orgId } = useAuth();
  const [sp, setSp] = useSearchParams();
  const ids = (sp.get("ids") ?? "").split(",").filter(Boolean).slice(0, 4);
  const q = useQuery({ queryKey: ["compare", ids.join()], enabled: !!orgId && ids.length > 0, queryFn: () => fetchBusinesses(orgId!, { ids }) });
  const add = (id: string) => !ids.includes(id) && ids.length < 4 && setSp({ ids: [...ids, id].join(",") });
  const remove = (id: string) => setSp({ ids: ids.filter((x) => x !== id).join(",") });
  return (
    <>
      <PageHeader title="Comparação entre estabelecimentos" subtitle="Compare até 4 estabelecimentos lado a lado" icon={GitCompare} />
      <Card className="p-4 mb-4"><BusinessPicker onPick={add} placeholder="Adicionar estabelecimento à comparação..." /></Card>
      {!ids.length ? <Card><EmptyState icon={GitCompare} title="Selecione estabelecimentos" description="Busque acima ou selecione de 2 a 4 na lista de resultados." /></Card> : q.isLoading ? <PageLoader /> : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="p-4 text-left text-[11px] uppercase tracking-wider text-ink-400 w-44" />
                {(q.data ?? []).map((b) => (
                  <th key={b.id} className="p-4 text-center align-top min-w-[180px]">
                    <div className="flex flex-col items-center gap-2">
                      <ScoreRing score={b.opportunity_score} />
                      <Link to={`/estabelecimento/${b.id}`} className="text-white hover:text-lime-400 font-medium">{b.name}</Link>
                      <button onClick={() => remove(b.id)} className="text-[11px] text-ink-400 hover:text-rose-300">remover</button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map(([label, fn]) => (
                <tr key={label} className="table-row">
                  <td className="p-3 pl-4 text-xs text-ink-400">{label}</td>
                  {(q.data ?? []).map((b) => <td key={b.id} className="p-3 text-center text-ink-100"><Val v={fn(b)} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
