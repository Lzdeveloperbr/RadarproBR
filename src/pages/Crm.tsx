import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users, Download, FileSpreadsheet, Calculator, Star, FileDown } from "lucide-react";
import { DndContext, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { KanbanSquare } from "lucide-react";
import { leadsWithBusiness } from "../lib/services";
import { LEAD_STATUS, leadStatusLabel, type LeadStatus } from "../lib/constants";
import type { Lead } from "../lib/types";
import { Badge, Button, Card, CardHeader, EmptyState, Field, PageHeader, PageLoader } from "../components/ui";
import { OpportunityBadge } from "../components/ui/StatusBadges";
import { exportCSV, exportPDFTable, exportXLSX, type Row } from "../lib/export";
import { fmtDate, fmtMoney } from "../lib/format";

function useLeads() {
  return useQuery({ queryKey: ["leads"], queryFn: async () => (await leadsWithBusiness()) as Lead[] });
}

const leadRows = (list: Lead[]): Row[] => list.map((l) => ({
  Estabelecimento: l.businesses?.name ?? "", Categoria: l.businesses?.category ?? "", Cidade: l.businesses?.city ?? "", Telefone: l.businesses?.phone ?? "",
  Status: leadStatusLabel(l.status), "Valor potencial": l.potential_value, Prioritário: l.is_priority ? "Sim" : "Não", Responsável: l.contact_name,
  "Data de retorno": l.next_follow_up, Oportunidade: l.businesses?.opportunity_level ?? "", Pontuação: l.businesses?.opportunity_score ?? null,
  Atualizado: new Date(l.updated_at).toLocaleString("pt-BR"),
}));

function PotentialCalculator({ leads }: { leads: Lead[] }) {
  const [ticket, setTicket] = useState(2500);
  const [rate, setRate] = useState(10);
  const [monthly, setMonthly] = useState(80);
  const opps = leads.filter((l) => l.businesses?.opportunity_level === "alta" || l.businesses?.opportunity_level === "media").length;
  const clients = Math.round((opps * rate) / 100);
  return (
    <Card>
      <CardHeader title="Calculadora de potencial comercial" icon={Calculator} subtitle={`${opps} oportunidades alta/média na base`} />
      <div className="grid gap-3 px-5 pb-5 sm:grid-cols-4 items-end">
        <Field label="Ticket médio (R$)"><input type="number" className="input" value={ticket} onChange={(e) => setTicket(Number(e.target.value) || 0)} /></Field>
        <Field label="Taxa de conversão (%)"><input type="number" className="input" value={rate} onChange={(e) => setRate(Number(e.target.value) || 0)} /></Field>
        <Field label="Recorrência mensal (R$)"><input type="number" className="input" value={monthly} onChange={(e) => setMonthly(Number(e.target.value) || 0)} /></Field>
        <div className="rounded-xl bg-lime-400/10 border border-lime-400/20 p-3">
          <div className="text-[11px] text-ink-300">≈ {clients} clientes</div>
          <div className="heading text-lg text-lime-400">{fmtMoney(clients * ticket)}</div>
          <div className="text-[11px] text-ink-300">+ {fmtMoney(clients * monthly * 12)}/ano recorrente</div>
        </div>
      </div>
      <p className="px-5 pb-4 text-[11px] text-ink-500">Estimativa baseada nos parâmetros informados — não é uma previsão garantida.</p>
    </Card>
  );
}

export function CrmPage() {
  const q = useLeads();
  const [status, setStatus] = useState<string>("");
  const [term, setTerm] = useState("");
  const [priority, setPriority] = useState(false);
  const list = useMemo(() => (q.data ?? []).filter((l) =>
    (!status || l.status === status) && (!priority || l.is_priority) &&
    (!term || `${l.businesses?.name} ${l.businesses?.city} ${l.businesses?.category}`.toLowerCase().includes(term.toLowerCase())),
  ), [q.data, status, term, priority]);
  const name = `radar-leads-${new Date().toISOString().slice(0, 10)}`;

  return (
    <>
      <PageHeader title="CRM de prospecção" subtitle={`${q.data?.length ?? 0} leads · sem duplicação de estabelecimentos`} icon={Users}
        actions={<>
          <Button variant="secondary" size="sm" icon={Download} onClick={() => exportCSV(leadRows(list), name)}>CSV</Button>
          <Button variant="secondary" size="sm" icon={FileSpreadsheet} onClick={() => exportXLSX([{ name: "Leads", rows: leadRows(list) }], name)}>Excel</Button>
          <Button variant="secondary" size="sm" icon={FileDown} onClick={() => exportPDFTable("Relatório de leads", leadRows(list), ["Estabelecimento", "Cidade", "Status", "Valor potencial", "Data de retorno", "Pontuação"], name)}>PDF</Button>
          <Link to="/kanban"><Button size="sm" icon={KanbanSquare}>Kanban</Button></Link>
        </>} />
      <div className="mb-4"><PotentialCalculator leads={q.data ?? []} /></div>
      <Card className="p-4 mb-4">
        <div className="grid gap-2 sm:grid-cols-[1fr_260px_auto]">
          <input className="input" placeholder="Filtrar por nome, cidade, categoria..." value={term} onChange={(e) => setTerm(e.target.value)} />
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos os status</option>
            {LEAD_STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <button onClick={() => setPriority(!priority)} className={`chip justify-center ${priority ? "chip-active" : ""}`}><Star className="size-3.5" />Prioritários</button>
        </div>
      </Card>
      <Card className="overflow-hidden">
        {q.isLoading ? <PageLoader /> : !list.length ? <EmptyState icon={Users} title="Nenhum lead" description="Leads são criados automaticamente nas pesquisas." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-wider text-ink-400 border-b border-white/[0.06]">
                <th className="py-3 pl-4">Estabelecimento</th><th>Status</th><th>Oportunidade</th><th>Valor potencial</th><th>Retorno</th><th className="pr-4">Atualizado</th>
              </tr></thead>
              <tbody>
                {list.map((l) => (
                  <tr key={l.id} className="table-row">
                    <td className="py-3 pl-4"><Link to={`/estabelecimento/${l.business_id}`} className="text-white hover:text-lime-400 font-medium">{l.is_priority && <Star className="inline size-3.5 mr-1 fill-lime-400 text-lime-400" />}{l.businesses?.name}</Link><div className="text-xs text-ink-400">{l.businesses?.category} · {l.businesses?.city}</div></td>
                    <td><Badge className="border-white/10" ><span className="size-1.5 rounded-full" style={{ background: LEAD_STATUS.find((s) => s.key === l.status)?.hex }} />{leadStatusLabel(l.status)}</Badge></td>
                    <td><OpportunityBadge level={l.businesses?.opportunity_level ?? null} score={l.businesses?.opportunity_score} /></td>
                    <td className="text-ink-200">{l.potential_value != null ? fmtMoney(l.potential_value) : "—"}</td>
                    <td className={l.next_follow_up && new Date(l.next_follow_up) < new Date(new Date().toDateString()) ? "text-rose-300" : "text-ink-300"}>{fmtDate(l.next_follow_up)}</td>
                    <td className="pr-4 text-xs text-ink-400">{fmtDate(l.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function KanbanCard({ lead }: { lead: Lead }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform) }} {...listeners} {...attributes}
      className={`rounded-xl border border-white/[0.06] bg-ink-800/90 p-3 cursor-grab active:cursor-grabbing touch-none ${isDragging ? "opacity-80 ring-2 ring-lime-400/50 z-50 relative" : ""}`}>
      <Link to={`/estabelecimento/${lead.business_id}`} onPointerDown={(e) => e.stopPropagation()} className="text-sm font-medium text-white hover:text-lime-400 line-clamp-2">{lead.is_priority && "★ "}{lead.businesses?.name}</Link>
      <div className="text-[11px] text-ink-400 mt-0.5">{lead.businesses?.category} · {lead.businesses?.city}</div>
      <div className="mt-2 flex items-center justify-between">
        {lead.businesses?.opportunity_score != null ? <span className="text-[11px] text-lime-400">● {lead.businesses.opportunity_score}</span> : <span />}
        {lead.potential_value != null && <span className="text-[11px] text-ink-200">{fmtMoney(lead.potential_value)}</span>}
      </div>
      {lead.next_follow_up && <div className="mt-1 text-[10px] text-ink-400">Retorno: {fmtDate(lead.next_follow_up)}</div>}
    </div>
  );
}

function Column({ status, label, hex, leads }: { status: LeadStatus; label: string; hex: string; leads: Lead[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const total = leads.reduce((n, l) => n + (l.potential_value ?? 0), 0);
  return (
    <div ref={setNodeRef} className={`flex w-72 shrink-0 flex-col rounded-2xl border bg-ink-900/60 transition ${isOver ? "border-lime-400/50 bg-lime-400/[0.03]" : "border-white/[0.05]"}`}>
      <div className="flex items-center justify-between px-3 py-3 border-b border-white/[0.05]">
        <span className="flex items-center gap-2 text-xs font-semibold text-white"><span className="size-2 rounded-full" style={{ background: hex }} />{label}</span>
        <span className="text-[11px] text-ink-400">{leads.length}{total ? ` · ${fmtMoney(total)}` : ""}</span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-2 max-h-[calc(100vh-260px)] min-h-32">
        {leads.slice(0, 200).map((l) => <KanbanCard key={l.id} lead={l} />)}
        {leads.length > 200 && <p className="text-center text-[11px] text-ink-500">+{leads.length - 200} leads (use o CRM para filtrar)</p>}
      </div>
    </div>
  );
}

export function KanbanPage() {
  const q = useLeads();
  const qc = useQueryClient();
  const [term, setTerm] = useState("");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }));
  const leads = (q.data ?? []).filter((l) => !term || `${l.businesses?.name} ${l.businesses?.city}`.toLowerCase().includes(term.toLowerCase()));

  const onDragEnd = async (e: DragEndEvent) => {
    const id = String(e.active.id);
    const to = e.over?.id as LeadStatus | undefined;
    const lead = q.data?.find((l) => l.id === id);
    if (!to || !lead || lead.status === to) return;
    qc.setQueryData(["leads"], (old: Lead[] | undefined) => old?.map((l) => (l.id === id ? { ...l, status: to } : l)));
    try {
      const { updateLead } = await import("../lib/db");
      await updateLead(id, { status: to, position: Date.now() / 1e6 });
    } catch (err: any) { toast.error("Falha ao mover: " + err.message); qc.invalidateQueries({ queryKey: ["leads"] }); return; }
    toast.success(`${lead.businesses?.name} → ${leadStatusLabel(to)}`);
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  return (
    <>
      <PageHeader title="Kanban de prospecção" subtitle="Arraste os cards entre as etapas do funil" icon={KanbanSquare}
        actions={<input className="input w-64" placeholder="Filtrar leads..." value={term} onChange={(e) => setTerm(e.target.value)} />} />
      {q.isLoading ? <PageLoader /> : (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-4 -mx-4 px-4 sm:mx-0 sm:px-0">
            {LEAD_STATUS.map((s) => <Column key={s.key} status={s.key} label={s.label} hex={s.hex} leads={leads.filter((l) => l.status === s.key)} />)}
          </div>
        </DndContext>
      )}
    </>
  );
}
