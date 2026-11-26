import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, Circle, TrendingUp, PhoneCall, FileText, ListChecks } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import { Card, CardHeader, PageHeader, PageLoader, StatCard } from "../components/ui";
import { fmtDate, fmtDateTime } from "../lib/format";

export function AgendaPage() {
  const { orgId, user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["agenda", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
      const [tasks, follow, notes, doneTasks, props] = await Promise.all([
        supabase.from("lead_tasks").select("*, leads(business_id, businesses(name, city))").eq("organization_id", orgId!).eq("done", false).order("due_at", { nullsFirst: false }).limit(500),
        supabase.from("leads").select("id, business_id, next_follow_up, status, businesses(name, city)").eq("organization_id", orgId!).not("next_follow_up", "is", null).not("status", "in", "(fechado,perdido)").order("next_follow_up").limit(500),
        supabase.from("lead_notes").select("id", { count: "exact", head: true }).eq("organization_id", orgId!).eq("user_id", user!.id).in("kind", ["call", "whatsapp", "email", "meeting", "visit"]).gte("created_at", weekAgo),
        supabase.from("lead_tasks").select("id", { count: "exact", head: true }).eq("organization_id", orgId!).eq("done", true).gte("done_at", weekAgo),
        supabase.from("proposals").select("id", { count: "exact", head: true }).eq("organization_id", orgId!).gte("created_at", weekAgo),
      ]);
      return { tasks: tasks.data ?? [], follow: follow.data ?? [], contacts: notes.count ?? 0, done: doneTasks.count ?? 0, proposals: props.count ?? 0 };
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
    await supabase.from("lead_tasks").update({ done: true, done_at: new Date().toISOString() }).eq("id", t.id);
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
