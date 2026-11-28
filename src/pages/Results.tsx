import { useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ListChecks, ScanSearch, Download, FileSpreadsheet, FileDown, GitCompare, Map as MapIcon, List, Star } from "lucide-react";
import { useBatchRunner } from "../hooks/useBatchRunner";
import { fetchBusinesses, type BusinessFilters } from "../lib/filters";
import { db, ensureLead } from "../lib/db";
import { Button, Card, EmptyState, PageHeader, PageLoader, Tabs } from "../components/ui";
import { FilterPanel } from "../components/FilterPanel";
import { BusinessList } from "../components/BusinessList";
import { AddBusinessButton, ImportCsvButton } from "../components/AddBusiness";
import { MapView, MapLegend } from "../components/MapView";
import { businessRows, exportCSV, exportPDFTable, exportXLSX } from "../lib/export";
const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
import { fmtDateTime } from "../lib/format";

function initialFilters(sp: URLSearchParams): BusinessFilters {
  const f: BusinessFilters = {};
  if (sp.get("search")) f.searchId = sp.get("search")!;
  if (sp.get("q")) f.q = sp.get("q")!;
  const preset = sp.get("f");
  if (preset === "high") f.levels = ["alta"];
  else if (preset === "no_site") f.onlyNoSite = true;
  else if (preset === "with_site") f.onlyWithSite = true;
  else if (preset === "issues") f.statuses = ["site_issues"];
  else if (preset) (f as any)[preset] = true;
  return f;
}

export function ResultsPage() {
  const runner = useBatchRunner();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [filters, setFilters] = useState<BusinessFilters>(() => initialFilters(sp));
  const [view, setView] = useState<"list" | "map">("list");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const search = useQuery({
    queryKey: ["search", filters.searchId],
    enabled: !!filters.searchId,
    queryFn: async () => (await db.searches.get(filters.searchId!)) ?? null,
  });
  const q = useQuery({
    queryKey: ["businesses", filters],
    queryFn: () => fetchBusinesses(filters),
  });
  const items = q.data ?? [];
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allSelected = items.length > 0 && items.every((b) => selected.has(b.id));
  const selectedList = useMemo(() => items.filter((b) => selected.has(b.id)), [items, selected]);
  const target = selectedList.length ? selectedList : items;

  const analyze = async () => {
    if (!target.length) return;
    try {
      const id = await runner.createJob(`Análise digital de ${target.length} estabelecimento(s)`, "audit", target.map((b) => ({ type: "audit", business_id: b.id, search_id: filters.searchId })));
      toast.success("Análise iniciada");
      nav(`/lote/${id}`);
    } catch (e) { toast.error(errorMessage(e)); }
  };
  const prioritize = async () => {
    for (const b of target) {
      const lead = await ensureLead(b.id);
      await db.leads.update(lead.id, { is_priority: true });
    }
    toast.success(`${target.length} estabelecimento(s) marcados como prioritários no CRM`);
  };
  const name = `radar-estabelecimentos-${new Date().toISOString().slice(0, 10)}`;

  return (
    <>
      <PageHeader title="Resultados da pesquisa" icon={ListChecks}
        subtitle={search.data ? `${search.data.categories.join(", ")} · ${search.data.city}${search.data.state ? "/" + search.data.state : ""} · ${fmtDateTime(search.data.created_at)} · ${search.data.total_found} encontrados, ${search.data.total_analyzed} analisados` : `${items.length} estabelecimentos`}
        actions={<Tabs value={view} onChange={setView} tabs={[{ key: "list", label: "Lista", icon: List }, { key: "map", label: "Mapa", icon: MapIcon }]} />} />
      <FilterPanel value={filters} onChange={(f) => { setFilters(f); setSelected(new Set()); }} compact />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-ink-300 mr-2">
          <input type="checkbox" className="accent-lime-400 size-4" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(items.map((b) => b.id)))} />
          {selected.size ? `${selected.size} selecionado(s)` : "Selecionar todos"}
        </label>
        <Button size="sm" icon={ScanSearch} onClick={analyze} disabled={!target.length}>Analisar {selected.size ? "selecionados" : "todos"}</Button>
        <Button size="sm" variant="secondary" icon={Star} onClick={prioritize} disabled={!target.length}>Prioritários</Button>
        <Button size="sm" variant="secondary" icon={GitCompare} disabled={selected.size < 2 || selected.size > 4} onClick={() => nav(`/comparar?ids=${[...selected].join(",")}`)}>Comparar</Button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <AddBusinessButton />
          <ImportCsvButton />
          <Button size="sm" variant="ghost" icon={Download} onClick={() => exportCSV(businessRows(target), name)}>CSV</Button>
          <Button size="sm" variant="ghost" icon={FileSpreadsheet} onClick={() => exportXLSX([{ name: "Estabelecimentos", rows: businessRows(target) }], name)}>Excel</Button>
          <Button size="sm" variant="ghost" icon={FileDown} onClick={() => exportPDFTable("Estabelecimentos encontrados", businessRows(target), ["Nome", "Categoria", "Cidade", "Telefone", "Site", "Presença digital", "Oportunidade", "Pontuação"], name)}>PDF</Button>
        </div>
      </div>

      <Card className="mt-4 overflow-hidden">
        {q.isLoading ? <PageLoader /> : q.error ? <EmptyState title="Erro ao carregar" description={errorMessage(q.error)} /> :
          !items.length ? <EmptyState icon={ListChecks} title="Nenhum estabelecimento encontrado" description="Ajuste os filtros ou faça uma nova pesquisa." action={<Button onClick={() => nav("/pesquisa")}>Nova pesquisa</Button>} /> :
          view === "list" ? <BusinessList items={items} selectable selected={selected} onToggle={toggle} /> : (
            <div className="p-3">
              <MapView businesses={items} onSelect={(b) => nav(`/estabelecimento/${b.id}`)} className="h-[65vh] w-full rounded-xl overflow-hidden" />
              <div className="mt-3"><MapLegend /></div>
            </div>
          )}
      </Card>
      {items.length >= 1000 && <p className="mt-2 text-xs text-ink-400">Exibindo os primeiros 1000 resultados. Refine os filtros para ver mais.</p>}
    </>
  );
}
