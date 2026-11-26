import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users, Plus, CheckCircle2, Circle, Trash2, MessageSquare } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";
import { LEAD_STATUS, leadStatusLabel } from "../../lib/constants";
import { Button, Card, CardHeader, Field, Toggle } from "../ui";
import { fmtDateTime } from "../../lib/format";
import type { Lead } from "../../lib/types";

const NOTE_KINDS = [["note", "Observação"], ["call", "Ligação"], ["whatsapp", "WhatsApp"], ["email", "E-mail"], ["meeting", "Reunião"], ["visit", "Visita"], ["proposal", "Proposta"]] as const;

export function CrmPanel({ businessId }: { businessId: string }) {
  const { orgId, user } = useAuth();
  const qc = useQueryClient();
  const lead = useQuery({
    queryKey: ["lead", businessId],
    queryFn: async () => {
      const { data } = await supabase.from("leads").select("*").eq("business_id", businessId).maybeSingle();
      if (data) return data as Lead;
      const { data: created, error } = await supabase.from("leads").insert({ organization_id: orgId, business_id: businessId, status: "novo" }).select().single();
      if (error) throw error;
      return created as Lead;
    },
  });
  const notes = useQuery({
    queryKey: ["lead_notes", lead.data?.id],
    enabled: !!lead.data,
    queryFn: async () => (await supabase.from("lead_notes").select("*").eq("lead_id", lead.data!.id).order("created_at", { ascending: false })).data ?? [],
  });
  const tasks = useQuery({
    queryKey: ["lead_tasks", lead.data?.id],
    enabled: !!lead.data,
    queryFn: async () => (await supabase.from("lead_tasks").select("*").eq("lead_id", lead.data!.id).order("done").order("due_at")).data ?? [],
  });
  const [note, setNote] = useState({ kind: "note", content: "" });
  const [task, setTask] = useState({ title: "", due: "" });

  const update = useMutation({
    mutationFn: async (patch: Partial<Lead>) => {
      const { error } = await supabase.from("leads").update(patch).eq("id", lead.data!.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["lead", businessId] }); qc.invalidateQueries({ queryKey: ["lead_notes"] }); qc.invalidateQueries({ queryKey: ["leads"] }); toast.success("Lead atualizado"); },
    onError: (e: any) => toast.error(e.message),
  });

  const addNote = async () => {
    if (!note.content.trim()) return;
    const { error } = await supabase.from("lead_notes").insert({ organization_id: orgId, lead_id: lead.data!.id, user_id: user!.id, kind: note.kind, content: note.content.trim() });
    if (error) return toast.error(error.message);
    if (["call", "whatsapp", "email", "meeting", "visit"].includes(note.kind) && ["novo", "nao_analisado", "analisado", "oportunidade"].includes(lead.data!.status)) {
      await supabase.from("leads").update({ status: "primeiro_contato" }).eq("id", lead.data!.id);
      qc.invalidateQueries({ queryKey: ["lead", businessId] });
    }
    setNote({ ...note, content: "" });
    qc.invalidateQueries({ queryKey: ["lead_notes", lead.data!.id] });
    toast.success("Registro adicionado");
  };
  const addTask = async () => {
    if (!task.title.trim()) return;
    const { error } = await supabase.from("lead_tasks").insert({ organization_id: orgId, lead_id: lead.data!.id, user_id: user!.id, title: task.title.trim(), due_at: task.due ? new Date(task.due).toISOString() : null });
    if (error) return toast.error(error.message);
    setTask({ title: "", due: "" });
    qc.invalidateQueries({ queryKey: ["lead_tasks", lead.data!.id] });
    toast.success("Tarefa criada");
  };
  const toggleTask = async (t: any) => {
    await supabase.from("lead_tasks").update({ done: !t.done, done_at: !t.done ? new Date().toISOString() : null }).eq("id", t.id);
    qc.invalidateQueries({ queryKey: ["lead_tasks", lead.data!.id] });
  };
  const removeTask = async (id: string) => {
    await supabase.from("lead_tasks").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["lead_tasks", lead.data!.id] });
  };

  if (!lead.data) return <Card className="p-5 text-sm text-ink-400">{lead.error ? (lead.error as Error).message : "Carregando CRM..."}</Card>;
  const L = lead.data;
  return (
    <Card>
      <CardHeader title="CRM de prospecção" icon={Users} subtitle={`Status atual: ${leadStatusLabel(L.status)}`} />
      <div className="px-5 pb-5 space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Status">
            <select className="input" value={L.status} onChange={(e) => update.mutate({ status: e.target.value as any })}>
              {LEAD_STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Valor potencial (R$)">
            <input type="number" min={0} step="50" className="input" defaultValue={L.potential_value ?? ""} key={`v${L.potential_value}`}
              onBlur={(e) => { const v = e.target.value === "" ? null : Number(e.target.value); if (v !== L.potential_value) update.mutate({ potential_value: v }); }} />
          </Field>
          <Field label="Responsável / contato no estabelecimento">
            <input className="input" defaultValue={L.contact_name ?? ""} key={`c${L.contact_name}`} onBlur={(e) => e.target.value !== (L.contact_name ?? "") && update.mutate({ contact_name: e.target.value || null })} />
          </Field>
          <Field label="Data de retorno">
            <input type="date" className="input" value={L.next_follow_up ?? ""} onChange={(e) => update.mutate({ next_follow_up: e.target.value || null })} />
          </Field>
        </div>
        <Toggle checked={L.is_priority} onChange={(v) => update.mutate({ is_priority: v })} label="Empresa prioritária" />
        {L.status === "perdido" && (
          <Field label="Motivo da perda"><input className="input" defaultValue={L.lost_reason ?? ""} onBlur={(e) => update.mutate({ lost_reason: e.target.value || null })} /></Field>
        )}

        <div>
          <div className="label">Tarefas</div>
          <div className="space-y-2">
            <input className="input" placeholder="Ex.: Ligar para apresentar proposta" value={task.title} onChange={(e) => setTask({ ...task, title: e.target.value })} />
            <div className="flex gap-2">
              <input type="datetime-local" className="input" value={task.due} onChange={(e) => setTask({ ...task, due: e.target.value })} />
              <Button icon={Plus} onClick={addTask}>Criar</Button>
            </div>
          </div>
          <div className="mt-2 space-y-1">
            {(tasks.data ?? []).map((t: any) => (
              <div key={t.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.03]">
                <button onClick={() => toggleTask(t)}>{t.done ? <CheckCircle2 className="size-4 text-lime-400" /> : <Circle className="size-4 text-ink-400" />}</button>
                <span className={`flex-1 text-sm ${t.done ? "line-through text-ink-500" : "text-ink-100"}`}>{t.title}</span>
                {t.due_at && <span className={`text-[11px] ${!t.done && new Date(t.due_at) < new Date() ? "text-rose-300" : "text-ink-400"}`}>{fmtDateTime(t.due_at)}</span>}
                <button onClick={() => removeTask(t.id)} className="text-ink-500 hover:text-rose-300"><Trash2 className="size-3.5" /></button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="label">Registrar contato / observação</div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {NOTE_KINDS.map(([k, l]) => <button key={k} onClick={() => setNote({ ...note, kind: k })} className={`chip py-1 ${note.kind === k ? "chip-active" : ""}`}>{l}</button>)}
          </div>
          <textarea className="input min-h-20" placeholder="Descreva o contato, resposta do cliente ou observação..." value={note.content} onChange={(e) => setNote({ ...note, content: e.target.value })} />
          <div className="mt-2 flex justify-end"><Button size="sm" icon={MessageSquare} onClick={addNote}>Registrar</Button></div>
        </div>

        <div>
          <div className="label">Histórico</div>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {(notes.data ?? []).length === 0 && <p className="text-xs text-ink-400">Sem registros ainda.</p>}
            {(notes.data ?? []).map((n: any) => (
              <div key={n.id} className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-3">
                <div className="flex justify-between text-[11px] text-ink-400"><span className="uppercase tracking-wider text-lime-400/80">{NOTE_KINDS.find((k) => k[0] === n.kind)?.[1] ?? "Status"}</span>{fmtDateTime(n.created_at)}</div>
                <p className="mt-1 text-sm text-ink-100 whitespace-pre-wrap">{n.content}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
