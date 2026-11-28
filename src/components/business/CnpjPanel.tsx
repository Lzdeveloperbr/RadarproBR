import { useState } from "react";
import { toast } from "sonner";
import { Landmark, Search, ExternalLink } from "lucide-react";
import { Badge, Button, Card, CardHeader } from "../ui";
import { consultarCnpj, formatCnpj, yearsSince } from "../../lib/cnpj";
import { db, nowIso, uid } from "../../lib/db";
import type { Business } from "../../lib/types";
import { fmtDate, fmtMoney } from "../../lib/format";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex justify-between gap-4 border-b border-white/[0.04] py-1.5 text-sm last:border-0"><span className="text-xs text-ink-400">{label}</span><span className="text-right text-ink-100">{value ?? "—"}</span></div>;
}

/** Dados públicos da Receita Federal via BrasilAPI (gratuito). */
export function CnpjPanel({ business, onSaved }: { business: Business; onSaved: () => void }) {
  const [cnpj, setCnpj] = useState(business.cnpj ?? "");
  const [loading, setLoading] = useState(false);
  const d = business.cnpj_data ?? null;
  const search = async () => {
    setLoading(true);
    try {
      const data = await consultarCnpj(cnpj);
      await db.businesses.update(business.id, { cnpj: data.cnpj, cnpj_data: data, updated_at: nowIso() });
      // E-mail e telefone cadastrados na Receita viram contatos (fonte identificada)
      for (const [type, value, url] of [["email", data.email, data.email ? `mailto:${data.email}` : null], ["phone", data.telefone, data.telefone ? `tel:+55${data.telefone.replace(/\D/g, "")}` : null]] as const) {
        if (value && !(await db.contacts.where("[business_id+type+value]").equals([business.id, type, value]).first())) await db.contacts.add({ id: uid(), business_id: business.id, type, value, url, source: "receita" });
      }
      toast.success("Dados da Receita Federal salvos");
      onSaved();
    } catch (e: any) { toast.error(e.message); } finally { setLoading(false); }
  };
  const anos = yearsSince(d?.data_abertura ?? null);
  return (
    <Card>
      <CardHeader title="Dados da Receita Federal (CNPJ)" icon={Landmark} subtitle="Consulta gratuita na BrasilAPI. Sócios não são armazenados (LGPD)." />
      <div className="px-5 pb-5 space-y-3">
        <div className="flex gap-2">
          <input className="input font-mono" placeholder="00.000.000/0000-00" value={cnpj} onChange={(e) => setCnpj(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} />
          <Button icon={Search} loading={loading} onClick={search}>Consultar</Button>
        </div>
        {!d && (
          <p className="text-[11px] text-ink-400">Não sabe o CNPJ? Procure no rodapé do site, na nota fiscal ou{" "}
            <a className="text-lime-400 hover:underline" target="_blank" rel="noreferrer" href={`https://www.google.com/search?q=${encodeURIComponent(`${business.name} ${business.city ?? ""} CNPJ`)}`}>pesquise no Google <ExternalLink className="inline size-3" /></a>.
          </p>
        )}
        {d && (
          <div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              <Badge className={d.situacao === "ATIVA" ? "border-lime-400/30 text-lime-400 bg-lime-400/10" : "border-rose-400/30 text-rose-300 bg-rose-400/10"}>{d.situacao ?? "Situação desconhecida"}</Badge>
              {anos != null && <Badge>{anos} {anos === 1 ? "ano" : "anos"} de empresa</Badge>}
              {d.mei && <Badge>MEI</Badge>}
              {d.simples && !d.mei && <Badge>Simples Nacional</Badge>}
            </div>
            <Row label="CNPJ" value={formatCnpj(d.cnpj)} />
            <Row label="Razão social" value={d.razao_social} />
            <Row label="Nome fantasia" value={d.nome_fantasia} />
            <Row label="Abertura" value={d.data_abertura ? fmtDate(d.data_abertura + "T12:00:00") : null} />
            <Row label="Porte" value={d.porte} />
            <Row label="Atividade principal" value={d.cnae_principal} />
            <Row label="Capital social" value={d.capital_social != null ? fmtMoney(d.capital_social) : null} />
            <Row label="Endereço na Receita" value={[d.endereco, d.municipio && `${d.municipio}/${d.uf}`, d.cep].filter(Boolean).join(" · ")} />
            <Row label="Telefone na Receita" value={d.telefone} />
            <Row label="E-mail na Receita" value={d.email} />
            <p className="mt-2 text-[10px] text-ink-500">Consultado em {fmtDate(d.fetched_at)} · Fonte: Receita Federal via BrasilAPI</p>
          </div>
        )}
      </div>
    </Card>
  );
}
