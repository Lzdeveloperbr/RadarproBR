import { useState } from "react";
import { toast } from "sonner";
import { BarChart3, FileSpreadsheet, FileDown, Download, Building2, GlobeLock, Target, MapPin, Tags, FileText, Radar } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import { fetchBusinesses } from "../lib/filters";
import { businessRows, exportCSV, exportPDFTable, exportXLSX, pdfHeader, type Row } from "../lib/export";
import { Button, Card, CardHeader, PageHeader } from "../components/ui";
import { BusinessPicker } from "../components/BusinessPicker";
import { CHECK_LABELS, DIGITAL_STATUS, leadStatusLabel } from "../lib/constants";
import { fmtDateTime } from "../lib/format";

type Fmt = "csv" | "xlsx" | "pdf";
const COLS = ["Nome", "Categoria", "Cidade", "Telefone", "Site", "Presença digital", "Oportunidade", "Pontuação"];

function group(rows: Row[], key: string): Row[] {
  const m = new Map<string, { total: number; semSite: number; alta: number }>();
  for (const r of rows) {
    const k = String(r[key] ?? "—");
    const g = m.get(k) ?? { total: 0, semSite: 0, alta: 0 };
    g.total++;
    if (r["Presença digital"] === DIGITAL_STATUS.no_site.label) g.semSite++;
    if (r["Oportunidade"] === "Oportunidade alta") g.alta++;
    m.set(k, g);
  }
  return [...m.entries()].sort((a, b) => b[1].total - a[1].total).map(([k, g]) => ({ [key]: k, Estabelecimentos: g.total, "Sem site identificado": g.semSite, "Oportunidade alta": g.alta }));
}

export function ReportsPage() {
  const { orgId } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const searches = useQuery({ queryKey: ["searches", "reports", orgId], enabled: !!orgId, queryFn: async () => (await supabase.from("searches").select("id, city, categories, created_at, total_found").eq("organization_id", orgId!).eq("status", "completed").order("created_at", { ascending: false }).limit(50)).data ?? [] });
  const [searchId, setSearchId] = useState("");

  const out = (rows: Row[], fmt: Fmt, title: string, file: string, cols = COLS) => {
    if (!rows.length) return toast.error("Sem dados para este relatório");
    if (fmt === "csv") exportCSV(rows, file);
    else if (fmt === "xlsx") exportXLSX([{ name: title, rows }], file);
    else exportPDFTable(title, rows, cols, file);
    toast.success("Relatório gerado");
  };
  const run = async (key: string, fmt: Fmt) => {
    setBusy(key + fmt);
    try {
      const date = new Date().toISOString().slice(0, 10);
      if (key === "all") out(businessRows(await fetchBusinesses(orgId!, {}, 10000)), fmt, "Empresas encontradas", `empresas-${date}`);
      if (key === "nosite") out(businessRows(await fetchBusinesses(orgId!, { onlyNoSite: true }, 10000)), fmt, "Empresas sem site identificado", `sem-site-${date}`);
      if (key === "opps") out(businessRows(await fetchBusinesses(orgId!, { levels: ["alta", "media"] }, 10000)), fmt, "Oportunidades comerciais", `oportunidades-${date}`);
      if (key === "city" || key === "category") {
        const { data } = await supabase.from("leads").select("status, potential_value, businesses(city, category, digital_status, opportunity_level)").eq("organization_id", orgId!).limit(10000);
        const field = key === "city" ? "Cidade" : "Categoria";
        const m = new Map<string, Row>();
        for (const l of data ?? []) {
          const b: any = l.businesses;
          const k = (key === "city" ? b?.city : b?.category) ?? "—";
          const r = m.get(k) ?? { [field]: k, Leads: 0, Contatados: 0, "Propostas enviadas": 0, Fechados: 0, "Valor potencial": 0 };
          (r.Leads as number)++;
          if (["primeiro_contato", "aguardando", "proposta_enviada", "negociacao", "fechado", "perdido"].includes(l.status)) (r.Contatados as number)++;
          if (l.status === "proposta_enviada") (r["Propostas enviadas"] as number)++;
          if (l.status === "fechado") (r.Fechados as number)++;
          r["Valor potencial"] = (r["Valor potencial"] as number) + (Number(l.potential_value) || 0);
          m.set(k, r);
        }
        const rows = [...m.values()].sort((a, b) => (b.Leads as number) - (a.Leads as number));
        out(rows, fmt, `Leads por ${field.toLowerCase()}`, `leads-por-${key}-${date}`, Object.keys(rows[0] ?? {}));
      }
      if (key === "search") {
        if (!searchId) throw new Error("Selecione a pesquisa");
        const rows = businessRows(await fetchBusinesses(orgId!, { searchId }, 10000));
        if (fmt === "xlsx") {
          exportXLSX([{ name: "Estabelecimentos", rows }, { name: "Por categoria", rows: group(rows, "Categoria") }, { name: "Por bairro", rows: group(rows, "Bairro") }], `pesquisa-${date}`);
          toast.success("Relatório gerado");
        } else out(rows, fmt, "Relatório de pesquisa completa", `pesquisa-${date}`);
      }
    } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };

  const individual = async (id: string) => {
    setBusy("ind");
    try {
      const [b, a, o, c] = await Promise.all([
        supabase.from("businesses").select("*").eq("id", id).single(),
        supabase.from("digital_audits").select("*").eq("business_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("opportunities").select("*").eq("business_id", id).maybeSingle(),
        supabase.from("leads").select("status, potential_value").eq("business_id", id).maybeSingle(),
      ]);
      const B = b.data!;
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      pdfHeader(doc, `Relatório individual — ${B.name}`, `${B.category ?? ""} · ${B.formatted_address ?? ""} · ${fmtDateTime(new Date().toISOString())}`);
      autoTable(doc, {
        startY: 130, theme: "plain", styles: { fontSize: 9 }, margin: { left: 32, right: 32 },
        body: [["Telefone", B.phone ?? "Não identificado"], ["Site", B.primary_website ?? "Não identificado"], ["Avaliação", B.rating != null ? `${B.rating} (${B.user_rating_count})` : "—"],
          ["Presença digital", DIGITAL_STATUS[B.digital_status as keyof typeof DIGITAL_STATUS]?.label], ["Oportunidade", o.data ? `${o.data.level} — ${o.data.score}/100` : "Não classificado"],
          ["Status no CRM", c.data ? leadStatusLabel(c.data.status) : "—"], ["Coordenadas", B.lat != null ? `${B.lat}, ${B.lng}` : "—"]],
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 130 } },
      });
      if (a.data) {
        autoTable(doc, {
          startY: (doc as any).lastAutoTable.finalY + 16, head: [["Verificação", "Resultado", "Evidência"]], margin: { left: 32, right: 32 },
          headStyles: { fillColor: [17, 20, 26], textColor: [198, 244, 50] }, styles: { fontSize: 8 },
          body: Object.entries(a.data.checks as Record<string, any>).map(([k, v]) => [CHECK_LABELS[k] ?? k, v.value === true ? "Sim" : v.value === false ? "Não identificado" : "Não verificado", (v.evidence ?? "").slice(0, 90)]),
        });
      }
      if (o.data) {
        autoTable(doc, {
          startY: (doc as any).lastAutoTable.finalY + 16, head: [["Tipo", "Motivo da classificação"]], margin: { left: 32, right: 32 },
          headStyles: { fillColor: [17, 20, 26], textColor: [198, 244, 50] }, styles: { fontSize: 8 },
          body: (o.data.reasons as any[]).map((r) => [r.kind === "fact" ? "Fato verificado" : "Estimativa", r.text]),
        });
      }
      doc.save(`relatorio-${B.name.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-")}.pdf`);
      toast.success("Relatório individual gerado");
    } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };

  const REPORTS = [
    { key: "all", title: "Empresas encontradas", desc: "Todos os estabelecimentos da base", icon: Building2 },
    { key: "nosite", title: "Empresas sem site", desc: "Sem site próprio identificado", icon: GlobeLock },
    { key: "opps", title: "Oportunidades comerciais", desc: "Oportunidades alta e média", icon: Target },
    { key: "city", title: "Leads por cidade", desc: "Funil e valor por cidade", icon: MapPin },
    { key: "category", title: "Leads por categoria", desc: "Funil e valor por categoria", icon: Tags },
  ];
  const btns = (k: string) => (
    <div className="flex gap-2">
      <Button size="sm" variant="secondary" icon={Download} loading={busy === k + "csv"} onClick={() => run(k, "csv")}>CSV</Button>
      <Button size="sm" variant="secondary" icon={FileSpreadsheet} loading={busy === k + "xlsx"} onClick={() => run(k, "xlsx")}>Excel</Button>
      <Button size="sm" variant="secondary" icon={FileDown} loading={busy === k + "pdf"} onClick={() => run(k, "pdf")}>PDF</Button>
    </div>
  );
  return (
    <>
      <PageHeader title="Exportação e relatórios" subtitle="CSV, Excel e PDF com os dados reais da sua base" icon={BarChart3} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {REPORTS.map((r) => (
          <Card key={r.key}>
            <CardHeader title={r.title} subtitle={r.desc} icon={r.icon} />
            <div className="px-5 pb-5">{btns(r.key)}</div>
          </Card>
        ))}
        <Card>
          <CardHeader title="Relatório de pesquisa completa" subtitle="Inclui resumo por categoria e bairro (Excel)" icon={Radar} />
          <div className="px-5 pb-5 space-y-3">
            <select className="input" value={searchId} onChange={(e) => setSearchId(e.target.value)}>
              <option value="">Selecione a pesquisa</option>
              {(searches.data ?? []).map((s: any) => <option key={s.id} value={s.id}>{s.categories.join(", ")} — {s.city} ({s.total_found}) · {new Date(s.created_at).toLocaleDateString("pt-BR")}</option>)}
            </select>
            {btns("search")}
          </div>
        </Card>
        <Card className="md:col-span-2 xl:col-span-3">
          <CardHeader title="Relatório individual" subtitle="PDF com dados públicos, análise do site e motivos da classificação" icon={FileText} />
          <div className="px-5 pb-5"><BusinessPicker onPick={individual} placeholder="Buscar estabelecimento para gerar o relatório..." /></div>
        </Card>
      </div>
    </>
  );
}
