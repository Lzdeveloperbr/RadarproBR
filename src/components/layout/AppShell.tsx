import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import {
  LayoutDashboard, Radar, Map, ListChecks, Users, KanbanSquare, FileText, Wand2, History, Star, BarChart3,
  Plug, Settings, UserCircle, ShieldCheck, LogOut, Menu, X, Layers, ScanSearch, CalendarClock, GitCompare, Search,
} from "lucide-react";
import { Logo } from "./Logo";
import { useAuth } from "../../hooks/useAuth";

const NAV = [
  { group: "Prospecção", items: [
    { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
    { to: "/pesquisa", label: "Nova pesquisa", icon: Radar },
    { to: "/resultados", label: "Estabelecimentos", icon: ListChecks },
    { to: "/mapa", label: "Mapa", icon: Map },
    { to: "/analise", label: "Análise digital", icon: ScanSearch },
    { to: "/lote", label: "Pesquisa em lote", icon: Layers },
  ]},
  { group: "Vendas", items: [
    { to: "/crm", label: "CRM", icon: Users },
    { to: "/kanban", label: "Kanban", icon: KanbanSquare },
    { to: "/agenda", label: "Agenda", icon: CalendarClock },
    { to: "/propostas", label: "Propostas", icon: FileText },
    { to: "/gerador-sites", label: "Gerador de sites", icon: Wand2 },
    { to: "/comparar", label: "Comparar", icon: GitCompare },
  ]},
  { group: "Dados", items: [
    { to: "/historico", label: "Histórico", icon: History },
    { to: "/favoritos", label: "Favoritos", icon: Star },
    { to: "/relatorios", label: "Relatórios", icon: BarChart3 },
  ]},
  { group: "Conta", items: [
    { to: "/integracoes", label: "Integrações", icon: Plug },
    { to: "/configuracoes", label: "Configurações", icon: Settings },
    { to: "/perfil", label: "Perfil", icon: UserCircle },
    { to: "/admin", label: "Administração", icon: ShieldCheck },
  ]},
];

const BOTTOM = [
  { to: "/", label: "Início", icon: LayoutDashboard, end: true },
  { to: "/pesquisa", label: "Pesquisar", icon: Radar },
  { to: "/mapa", label: "Mapa", icon: Map },
  { to: "/kanban", label: "CRM", icon: KanbanSquare },
];

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const { profile, orgName, signOut } = useAuth();
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 py-5"><Logo /></div>
      <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-5">
        {NAV.map((g) => (
          <div key={g.group}>
            <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500">{g.group}</div>
            {g.items.map((it) => (
              <NavLink key={it.to} to={it.to} end={it.end} onClick={onNavigate}
                className={({ isActive }) => clsx("group flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium transition",
                  isActive ? "bg-lime-400/10 text-lime-400 shadow-[inset_0_0_0_1px_rgba(198,244,50,.2)]" : "text-ink-300 hover:bg-white/[0.04] hover:text-white")}>
                <it.icon className="size-4 shrink-0" />{it.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="border-t border-white/[0.06] p-3">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <div className="grid size-9 place-items-center rounded-full bg-lime-400/15 text-lime-400 heading font-semibold">
            {(profile?.full_name ?? profile?.email ?? "?").slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-white">{profile?.full_name ?? "Usuário"}</div>
            <div className="truncate text-[11px] text-ink-400">{orgName}</div>
          </div>
          <button onClick={signOut} title="Sair" className="rounded-lg p-2 text-ink-400 hover:bg-white/5 hover:text-rose-300"><LogOut className="size-4" /></button>
        </div>
      </div>
    </div>
  );
}

export function AppShell() {
  const [open, setOpen] = useState(false);
  const [quick, setQuick] = useState("");
  const loc = useLocation();
  const nav = useNavigate();
  useEffect(() => setOpen(false), [loc.pathname]);

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-white/[0.06] bg-ink-900/80 backdrop-blur-xl lg:block"><SideNav /></aside>

      {open && (
        <div className="fixed inset-0 z-[900] lg:hidden">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-ink-900 border-r border-white/[0.06] animate-slide-up">
            <button onClick={() => setOpen(false)} className="absolute right-3 top-5 rounded-lg p-2 text-ink-300 hover:bg-white/5" aria-label="Fechar menu"><X className="size-5" /></button>
            <SideNav onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-white/[0.06] bg-ink-950/75 px-4 backdrop-blur-xl sm:px-6">
        <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-ink-200 hover:bg-white/5 lg:hidden" aria-label="Abrir menu"><Menu className="size-5" /></button>
        <div className="lg:hidden whitespace-nowrap"><span className="heading font-bold text-white text-sm">RADAR <span className="text-lime-400">LOCAL</span> PRO</span></div>
        <form className="ml-auto flex w-full max-w-md items-center" onSubmit={(e) => { e.preventDefault(); if (quick.trim()) nav(`/resultados?q=${encodeURIComponent(quick.trim())}`); }}>
          <div className="relative w-full hidden sm:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
            <input value={quick} onChange={(e) => setQuick(e.target.value)} className="input pl-9 h-10" placeholder="Pesquisa rápida: nome, cidade, categoria..." />
          </div>
        </form>
        <NavLink to="/pesquisa" className="hidden sm:inline-flex h-10 items-center gap-2 rounded-xl bg-lime-400 px-4 text-sm font-medium text-ink-950 hover:bg-lime-500"><Radar className="size-4" />Pesquisar</NavLink>
        <NavLink to="/resultados" className="sm:hidden ml-auto rounded-lg p-2 text-ink-200 hover:bg-white/5" aria-label="Buscar"><Search className="size-5" /></NavLink>
      </header>

      <main className="mx-auto max-w-[1500px] px-4 py-6 pb-28 sm:px-6 lg:pb-10">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.06] bg-ink-900/90 backdrop-blur-xl lg:hidden safe-bottom">
        <div className="grid grid-cols-5">
          {BOTTOM.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => clsx("flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium", isActive ? "text-lime-400" : "text-ink-400")}>
              <it.icon className="size-5" />{it.label}
            </NavLink>
          ))}
          <button onClick={() => setOpen(true)} className="flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium text-ink-400"><Menu className="size-5" />Mais</button>
        </div>
      </nav>
    </div>
  );
}
