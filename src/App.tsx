import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { BatchRunnerProvider } from "./hooks/useBatchRunner";
import { isSupabaseConfigured } from "./lib/supabase";
import { AppShell } from "./components/layout/AppShell";
import { PageLoader } from "./components/ui";
import { LoginPage, SignupPage, ForgotPasswordPage, ResetPasswordPage, SetupRequired } from "./pages/Auth";
import { LogoMark } from "./components/layout/Logo";

const named = <T extends string>(loader: () => Promise<Record<T, any>>, name: T) => lazy(() => loader().then((m) => ({ default: m[name] })));
const DashboardPage = named(() => import("./pages/Dashboard"), "DashboardPage");
const NewSearchPage = named(() => import("./pages/NewSearch"), "NewSearchPage");
const ResultsPage = named(() => import("./pages/Results"), "ResultsPage");
const MapPage = named(() => import("./pages/MapPage"), "MapPage");
const BusinessDetailPage = named(() => import("./pages/BusinessDetail"), "BusinessDetailPage");
const DigitalAnalysisPage = named(() => import("./pages/DigitalAnalysis"), "DigitalAnalysisPage");
const CrmPage = named(() => import("./pages/Crm"), "CrmPage");
const KanbanPage = named(() => import("./pages/Crm"), "KanbanPage");
const AgendaPage = named(() => import("./pages/Agenda"), "AgendaPage");
const ProposalsPage = named(() => import("./pages/Proposals"), "ProposalsPage");
const ProposalEditorPage = named(() => import("./pages/Proposals"), "ProposalEditorPage");
const SiteGeneratorPage = named(() => import("./pages/SiteGenerator"), "SiteGeneratorPage");
const HistoryPage = named(() => import("./pages/History"), "HistoryPage");
const FavoritesPage = named(() => import("./pages/Favorites"), "FavoritesPage");
const ReportsPage = named(() => import("./pages/Reports"), "ReportsPage");
const IntegrationsPage = named(() => import("./pages/Integrations"), "IntegrationsPage");
const SettingsPage = named(() => import("./pages/Settings"), "SettingsPage");
const ProfilePage = named(() => import("./pages/Settings"), "ProfilePage");
const AdminPage = named(() => import("./pages/Admin"), "AdminPage");
const BatchPage = named(() => import("./pages/Batch"), "BatchPage");
const BatchDetailPage = named(() => import("./pages/Batch"), "BatchDetailPage");
const ComparePage = named(() => import("./pages/Compare"), "ComparePage");

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 20_000, retry: 1, refetchOnWindowFocus: false } } });

function Splash() {
  return <div className="grid min-h-screen place-items-center"><div className="flex flex-col items-center gap-4 animate-fade-in"><LogoMark className="size-16" /><span className="heading text-sm tracking-widest text-ink-300">RADAR LOCAL PRO</span></div></div>;
}

function Protected({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <Splash />;
  if (!session) return <Navigate to="/login" replace />;
  return <BatchRunnerProvider>{children}</BatchRunnerProvider>;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <Splash />;
  return session ? <Navigate to="/" replace /> : <>{children}</>;
}

export default function App() {
  if (!isSupabaseConfigured) return <SetupRequired />;
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
              <Route path="/cadastro" element={<PublicOnly><SignupPage /></PublicOnly>} />
              <Route path="/recuperar-senha" element={<ForgotPasswordPage />} />
              <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
              <Route element={<Protected><AppShell /></Protected>}>
                <Route index element={<DashboardPage />} />
                <Route path="pesquisa" element={<NewSearchPage />} />
                <Route path="resultados" element={<ResultsPage />} />
                <Route path="mapa" element={<MapPage />} />
                <Route path="estabelecimento/:id" element={<BusinessDetailPage />} />
                <Route path="analise" element={<DigitalAnalysisPage />} />
                <Route path="lote" element={<BatchPage />} />
                <Route path="lote/:id" element={<BatchDetailPage />} />
                <Route path="crm" element={<CrmPage />} />
                <Route path="kanban" element={<KanbanPage />} />
                <Route path="agenda" element={<AgendaPage />} />
                <Route path="propostas" element={<ProposalsPage />} />
                <Route path="propostas/nova" element={<ProposalEditorPage />} />
                <Route path="propostas/:id" element={<ProposalEditorPage />} />
                <Route path="gerador-sites" element={<SiteGeneratorPage />} />
                <Route path="comparar" element={<ComparePage />} />
                <Route path="historico" element={<HistoryPage />} />
                <Route path="favoritos" element={<FavoritesPage />} />
                <Route path="relatorios" element={<ReportsPage />} />
                <Route path="integracoes" element={<IntegrationsPage />} />
                <Route path="configuracoes" element={<SettingsPage />} />
                <Route path="perfil" element={<ProfilePage />} />
                <Route path="admin" element={<AdminPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
      <Toaster theme="dark" position="top-right" richColors toastOptions={{ style: { background: "#11141a", border: "1px solid rgba(255,255,255,.08)" } }} />
    </QueryClientProvider>
  );
}
