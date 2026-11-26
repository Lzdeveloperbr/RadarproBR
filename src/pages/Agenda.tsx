import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, Circle, TrendingUp, PhoneCall, FileText, ListChecks } from "lucide-react";
import { db, nowIso } from "../lib/db";
import { Card, CardHeader, PageHeader, PageLoader, StatCard } from "../components/ui";
import { fmtDate, fmtDateTime } from "../lib/format";

export function AgendaPage() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["agenda"],
    queryFn: async () => {
      const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
      const withBiz = async (leadId: string) => {
        const lead = await db.leads.get(leadId);
        const b = lead ? await db.businesses.get(lead.business_id) : undefined;
        return { business_id: lead?.business_id, businesses: { name: b?.name, city: b?.city } };
      };
      const tasks = await Promise.all((await db.lead_tasks.filter((t) => !t.done).toArray())
        .sort((a, b) => (a.due_at ?? "9").localeCompare(b.due_at ?? "9")).slice(0, 500).map(async (t) => ({ ...t, leads: await withBiz(t.lead_id) })));
      const leads = (await db.leads.filter((l) => !!l.next_follow_up && !["fechado", "perdido"].includes(l.status)).toArray()).sort((a, b) => a.next_follow_up!.localeCompare(b.next_follow_up!));
      const lb = await db.businesses.bulkGet(leads.map((l) => l.business_id));
      return {
        tasks,
        follow: leads.map((l, i) => ({ ...l, businesses: { name: lb[i]?.name, city: lb[i]?.city } })),
        contacts: await db.lead_notes.filter((n) => ["call", "whatsapp", "email", "meeting", "visit"].includes(n.kind) && n.created_at >= weekAgo).count(),
        done: await db.lead_tasks.filter((t) => t.done && (t.done_at ?? "") >= weekAgo).count(),
        proposals: await db.proposals.filter((p) => p.created_at >= weekAgo).count(),
      };
    },
  });
  if (q.isLoading || !q.data) return <PageLoader />;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 86400_000);
  const week = new Date(today.getTime() + 7 * 86400_000);
  const groups = [
    { label: "Atrasadas", filter: (d: Date | null) => !!d && d < today, cls: "text-rose-300" },
    { label: "Hoje", filter: (d: Date | null) => !!d && d >= today && d < tomorrow, cls: "text-lime-400" },
    { label: "Próximos 7 dias", filter: (d: Date | null) => !!d && d >= tomorrow && d < week, cls: "text-white" },
    { label: "Depois / sem data", filter: (d: Date | null) => !d || d >= week, cls: "text-ink-300" },
  ];
  const toggle = async (t: any) => {
    await db.lead_tasks.update(t.id, { done: true, done_at: nowIso() });
    qc.invalidateQueries({ queryKey: ["agenda"] });
  };
  return (
    <>
      <PageHeader title="Agenda de prospecção" subtitle="Tarefas, retornos e painel de produtividade" icon={CalendarClock} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 mb-4">
        <StatCard label="Contatos (7 dias)" value={q.data.contacts} icon={PhoneCall} accent />
        <StatCard label="Tarefas concluídas (7 dias)" value={q.data.done} icon={CheckCircle2} />
        <StatCard label="Propostas criadas (7 dias)" value={q.data.proposals} icon={FileText} />
        <StatCard label="Tarefas pendentes" value={q.data.tasks.length} icon={ListChecks} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader title="Tarefas" icon={ListChecks} />
          <div className="px-5 pb-5 space-y-5">
            {groups.map((g) => {
              const items = q.data.tasks.filter((t: any) => g.filter(t.due_at ? new Date(t.due_at) : null));
              if (!items.length) return null;
              return (
                <div key={g.label}>
                  <div className={`text-xs font-semibold uppercase tracking-wider mb-2 ${g.cls}`}>{g.label} · {items.length}</div>
                  <div className="space-y-1">
                    {items.map((t: any) => (
                      <div key={t.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.03]">
                        <button onClick={() => toggle(t)} aria-label="Concluir"><Circle className="size-4 text-ink-400 hover:text-lime-400" /></button>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-white truncate">{t.title}</div>
                          <Link to={`/estabelecimento/${t.leads?.business_id}`} className="text-[11px] text-ink-400 hover:text-lime-400">{t.leads?.businesses?.name} · {t.leads?.businesses?.city}</Link>
                        </div>
                        <span className="text-[11px] text-ink-400">{fmtDateTime(t.due_at)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {!q.data.tasks.length && <p className="text-sm text-ink-400">Nenhuma tarefa pendente. Crie tarefas na ficha de cada estabelecimento.</p>}
          </div>
        </Card>
        <Card>
          <CardHeader title="Datas de retorno" icon={TrendingUp} />
          <div className="px-5 pb-5 space-y-1">
            {!q.data.follow.length && <p className="text-sm text-ink-400">Sem retornos agendados.</p>}
            {q.data.follow.map((l: any) => (
              <Link key={l.id} to={`/estabelecimento/${l.business_id}`} className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-white/[0.03]">
                <span className="text-sm text-white truncate">{l.businesses?.name}</span>
                <span className={`text-xs ${new Date(l.next_follow_up + "T23:59:59") < new Date() ? "text-rose-300" : "text-ink-300"}`}>{fmtDate(l.next_follow_up + "T12:00:00")}</span>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
