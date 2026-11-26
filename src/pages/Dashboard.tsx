import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  Building2, Globe, GlobeLock, ServerCrash, MapPinOff, Camera as Instagram, MessageCircle, CalendarCheck, UtensilsCrossed,
  Target, PhoneCall, FileText, Trophy, Activity, Radar, Bell, CheckCircle2, Clock,
} from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, AreaChart, Area, CartesianGrid } from "recharts";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import { Card, CardHeader, PageHeader, StatCard, PageLoader, EmptyState, Button, Badge } from "../components/ui";
import { fmtMoney, fmtNumber, timeAgo, fmtDateTime } from "../lib/format";
import { LEAD_STATUS } from "../lib/constants";

const tooltipStyle = { contentStyle: { background: "#11141a", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, fontSize: 12 }, labelStyle: { color: "#e4e8ef" }, itemStyle: { color: "#c6f432" } };
const axis = { stroke: "#5b6476", fontSize: 11, tickLine: false, axisLine: false };

const ACTION_LABEL: Record<string, string> = {
  "search.completed": "Pesquisa concluída", "search.failed": "Pesquisa com falha", "audit.completed": "Análise digital concluída",
  "opportunity.alert": "Alerta de oportunidade", "ai.generated": "Conteúdo gerado por IA", "site.went_offline": "Site saiu do ar",
  "site.back_online": "Site voltou ao ar", "member.invited": "Membro convidado", "member.added": "Membro adicionado",
  "proposal.created": "Proposta criada", "lead.updated": "Lead atualizado",
};

export function DashboardPage() {
  const { orgId, profile } = useAuth();
  const nav = useNavigate();
  const stats = useQuery({
    queryKey: ["dashboard", orgId],
    enabled: !!orgId,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_stats", { p_org: orgId });
      if (error) throw error;
      return data as any;
    },
  });
  const activity = useQuery({
    queryKey: ["activity", orgId],
    enabled: !!orgId,
    refetchInterval: 15000,
    queryFn: async () => (await supabase.from("activity_logs").select("*").eq("organization_id", orgId!).order("created_at", { ascending: false }).limit(12)).data ?? [],
  });
  const searches = useQuery({
    queryKey: ["searches", "recent", orgId],
    enabled: !!orgId,
    queryFn: async () => (await supabase.from("searches").select("*").eq("organization_id", orgId!).order("created_at", { ascending: false }).limit(6)).data ?? [],
  });
  const tasks = useQuery({
    queryKey: ["tasks", "today", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const end = new Date(); end.setHours(23, 59, 59, 999);
      return (await supabase.from("lead_tasks").select("*, leads(business_id, businesses(name))").eq("organization_id", orgId!).eq("done", false).lte("due_at", end.toISOString()).order("due_at").limit(8)).data ?? [];
    },
  });

  if (stats.isLoading) return <PageLoader label="Carregando indicadores..." />;
  if (stats.error) return <EmptyState title="Não foi possível carregar o dashboard" description={(stats.error as Error).message} />;
  const s = stats.data ?? {};

  if (!s.total) {
    return (
      <>
        <PageHeader title={`Olá, ${profile?.full_name?.split(" ")[0] ?? ""}`} subtitle="Sua central de inteligência comercial" />
        <Card className="p-2"><EmptyState icon={Radar} title="Nenhum estabelecimento pesquisado ainda"
          description="Escolha uma cidade e categorias para descobrir estabelecimentos reais, verificar seus sites e identificar oportunidades."
          action={<Button icon={Radar} onClick={() => nav("/pesquisa")}>Fazer primeira pesquisa</Button>} /></Card>
      </>
    );
  }

  const siteVs = [
    { name: "Com site próprio", value: s.with_site, color: "#34d399" },
    { name: "Site não identificado", value: s.without_site, color: "#fb7185" },
    { name: "Não verificado", value: Math.max(0, s.not_verified - 0), color: "#5b6476" },
  ].filter((x) => x.value > 0);
  const oppData = [
    { name: "Alta", value: s.opp_alta, color: "#c6f432" },
    { name: "Média", value: s.opp_media, color: "#fcd34d" },
    { name: "Baixa", value: s.opp_baixa, color: "#5b6476" },
  ];
  const funnel = LEAD_STATUS.map((l) => ({ name: l.label, value: s.lead_funnel?.[l.key] ?? 0, color: l.hex }));
  const conversion = s.leads_contacted ? Math.round((s.clients_won / s.leads_contacted) * 100) : 0;

  return (
    <>
      <PageHeader title={`Olá, ${profile?.full_name?.split(" ")[0] ?? ""}`} subtitle="Indicadores atualizados em tempo real" icon={Activity}
        actions={<><Button variant="secondary" onClick={() => nav("/relatorios")}>Relatórios</Button><Button icon={Radar} onClick={() => nav("/pesquisa")}>Nova pesquisa</Button></>} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <StatCard label="Estabelecimentos" value={fmtNumber(s.total)} icon={Building2} hint={`${fmtNumber(s.analyzed)} analisados`} onClick={() => nav("/resultados")} />
        <StatCard label="Com site próprio" value={fmtNumber(s.with_site)} icon={Globe} onClick={() => nav("/resultados?f=onlyWithSite")} />
        <StatCard label="Sem site identificado" value={fmtNumber(s.without_site)} icon={GlobeLock} accent onClick={() => nav("/resultados?f=onlyNoSite")} />
        <StatCard label="Sites fora do ar" value={fmtNumber(s.sites_offline)} icon={ServerCrash} onClick={() => nav("/resultados?f=sitesOffline")} />
        <StatCard label="Sites sem endereço" value={fmtNumber(s.sites_no_location)} icon={MapPinOff} onClick={() => nav("/resultados?f=noLocation")} />
        <StatCard label="Com Instagram" value={fmtNumber(s.with_instagram)} icon={Instagram} />
        <StatCard label="Com WhatsApp" value={fmtNumber(s.with_whatsapp)} icon={MessageCircle} />
        <StatCard label="Agendamento online" value={fmtNumber(s.with_booking)} icon={CalendarCheck} />
        <StatCard label="Cardápio digital" value={fmtNumber(s.with_menu)} icon={UtensilsCrossed} />
        <StatCard label="Oportunidades" value={fmtNumber(s.opportunities)} icon={Target} accent hint={`${fmtNumber(s.opp_alta)} de nível alto`} onClick={() => nav("/resultados?f=high")} />
        <StatCard label="Leads contatados" value={fmtNumber(s.leads_contacted)} icon={PhoneCall} onClick={() => nav("/crm")} />
        <StatCard label="Propostas enviadas" value={fmtNumber(s.proposals_sent)} icon={FileText} onClick={() => nav("/propostas")} />
        <StatCard label="Clientes convertidos" value={fmtNumber(s.clients_won)} icon={Trophy} accent hint={fmtMoney(s.won_value)} />
        <StatCard label="Pipeline aberto" value={fmtMoney(s.pipeline_value)} icon={Target} hint={`Conversão ${conversion}%`} onClick={() => nav("/kanban")} />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Estabelecimentos por categoria" icon={Building2} />
          <div className="h-72 px-2 pb-4">
            <ResponsiveContainer><BarChart data={s.by_category} margin={{ left: -10, right: 10 }}>
              <CartesianGrid stroke="rgba(255,255,255,.04)" vertical={false} />
              <XAxis dataKey="name" {...axis} interval={0} angle={-25} textAnchor="end" height={70} />
              <YAxis {...axis} allowDecimals={false} />
              <Tooltip {...tooltipStyle} cursor={{ fill: "rgba(198,244,50,.05)" }} />
              <Bar dataKey="value" name="Estabelecimentos" fill="#c6f432" radius={[6, 6, 0, 0]} />
            </BarChart></ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardHeader title="Com site × sem site" icon={Globe} />
          <div className="h-72 pb-4">
            <ResponsiveContainer><PieChart>
              <Pie data={siteVs} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={3} stroke="none">
                {siteVs.map((d) => <Cell key={d.name} fill={d.color} />)}
              </Pie>
              <Tooltip {...tooltipStyle} />
            </PieChart></ResponsiveContainer>
          </div>
          <div className="flex flex-wrap justify-center gap-3 pb-5 text-xs text-ink-300">
            {siteVs.map((d) => <span key={d.name} className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: d.color }} />{d.name}: {d.value}</span>)}
          </div>
        </Card>
        <Card>
          <CardHeader title="Estabelecimentos por cidade" icon={Building2} />
          <div className="h-64 px-2 pb-4">
            <ResponsiveContainer><BarChart data={s.by_city} layout="vertical" margin={{ left: 20, right: 10 }}>
              <XAxis type="number" {...axis} allowDecimals={false} />
              <YAxis type="category" dataKey="name" {...axis} width={110} />
              <Tooltip {...tooltipStyle} cursor={{ fill: "rgba(198,244,50,.05)" }} />
              <Bar dataKey="value" name="Estabelecimentos" fill="#38bdf8" radius={[0, 6, 6, 0]} />
            </BarChart></ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardHeader title="Oportunidades por nível" icon={Target} />
          <div className="h-64 px-2 pb-4">
            <ResponsiveContainer><BarChart data={oppData}>
              <XAxis dataKey="name" {...axis} /><YAxis {...axis} allowDecimals={false} />
              <Tooltip {...tooltipStyle} cursor={{ fill: "rgba(198,244,50,.05)" }} />
              <Bar dataKey="value" name="Estabelecimentos" radius={[6, 6, 0, 0]}>{oppData.map((d) => <Cell key={d.name} fill={d.color} />)}</Bar>
            </BarChart></ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardHeader title="Evolução das pesquisas (30 dias)" icon={Activity} />
          <div className="h-64 px-2 pb-4">
            <ResponsiveContainer><AreaChart data={(s.searches_timeline ?? []).map((t: any) => ({ ...t, date: new Date(t.date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) }))}>
              <defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#c6f432" stopOpacity={0.4} /><stop offset="100%" stopColor="#c6f432" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid stroke="rgba(255,255,255,.04)" vertical={false} />
              <XAxis dataKey="date" {...axis} /><YAxis {...axis} allowDecimals={false} />
              <Tooltip {...tooltipStyle} />
              <Area type="monotone" dataKey="found" name="Encontrados" stroke="#c6f432" fill="url(#g1)" strokeWidth={2} />
              <Area type="monotone" dataKey="searches" name="Pesquisas" stroke="#38bdf8" fill="transparent" strokeWidth={2} />
            </AreaChart></ResponsiveContainer>
          </div>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Conversão de leads" subtitle={`Taxa de conversão (fechados / contatados): ${conversion}%`} icon={Trophy} />
          <div className="h-72 px-2 pb-4">
            <ResponsiveContainer><BarChart data={funnel} layout="vertical" margin={{ left: 60, right: 20 }}>
              <XAxis type="number" {...axis} allowDecimals={false} />
              <YAxis type="category" dataKey="name" {...axis} width={150} />
              <Tooltip {...tooltipStyle} cursor={{ fill: "rgba(198,244,50,.05)" }} />
              <Bar dataKey="value" name="Leads" radius={[0, 6, 6, 0]}>{funnel.map((d) => <Cell key={d.name} fill={d.color} />)}</Bar>
            </BarChart></ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardHeader title="Agenda de hoje" subtitle="Tarefas pendentes e atrasadas" icon={Clock} action={<Link to="/agenda" className="text-xs text-lime-400 hover:underline">Ver agenda</Link>} />
          <div className="px-5 pb-5 space-y-2">
            {(tasks.data ?? []).length === 0 && <p className="text-sm text-ink-400 py-4">Nenhuma tarefa pendente para hoje.</p>}
            {(tasks.data ?? []).map((t: any) => (
              <Link key={t.id} to={`/estabelecimento/${t.leads?.business_id}`} className="flex items-start gap-3 rounded-xl p-2 hover:bg-white/[0.03]">
                <CheckCircle2 className={`size-4 mt-0.5 ${new Date(t.due_at) < new Date() ? "text-rose-400" : "text-ink-400"}`} />
                <div className="min-w-0"><div className="text-sm text-white truncate">{t.title}</div><div className="text-[11px] text-ink-400">{t.leads?.businesses?.name} · {fmtDateTime(t.due_at)}</div></div>
              </Link>
            ))}
          </div>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Atividades recentes" icon={Bell} />
          <div className="px-5 pb-5 divide-y divide-white/[0.04]">
            {(activity.data ?? []).length === 0 && <p className="text-sm text-ink-400 py-4">Sem atividades.</p>}
            {(activity.data ?? []).map((a: any) => (
              <div key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`size-2 rounded-full shrink-0 ${a.level === "alert" ? "bg-lime-400" : a.level === "error" ? "bg-rose-400" : "bg-ink-500"}`} />
                  <div className="min-w-0">
                    <div className="text-sm text-ink-100 truncate">
                      {ACTION_LABEL[a.action] ?? a.action}
                      {a.details?.name && <> — {a.entity_type === "business" ? <Link className="text-lime-400 hover:underline" to={`/estabelecimento/${a.entity_id}`}>{a.details.name}</Link> : a.details.name}</>}
                      {a.details?.city && <> — {a.details.city}</>}
                    </div>
                    {a.details?.score != null && <div className="text-[11px] text-ink-400">Pontuação {a.details.score}</div>}
                    {a.details?.found != null && <div className="text-[11px] text-ink-400">{a.details.found} encontrados · {a.details.new} novos</div>}
                  </div>
                </div>
                <span className="text-[11px] text-ink-500 whitespace-nowrap">{timeAgo(a.created_at)}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Histórico de pesquisas" icon={Radar} action={<Link to="/historico" className="text-xs text-lime-400 hover:underline">Ver tudo</Link>} />
          <div className="px-5 pb-5 space-y-2">
            {(searches.data ?? []).map((sr: any) => (
              <Link key={sr.id} to={`/resultados?search=${sr.id}`} className="block rounded-xl p-2.5 hover:bg-white/[0.03]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-white truncate">{sr.categories.join(", ")}</span>
                  <Badge className={sr.status === "completed" ? "border-lime-400/30 text-lime-400 bg-lime-400/10" : sr.status === "failed" ? "border-rose-400/30 text-rose-300 bg-rose-400/10" : undefined}>{sr.total_found}</Badge>
                </div>
                <div className="text-[11px] text-ink-400">{sr.city}{sr.state ? `/${sr.state}` : ""} · {timeAgo(sr.created_at)}</div>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
