import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Mail, Lock, User, Building2, ArrowRight, Radar, MapPin, TrendingUp } from "lucide-react";
import { supabase } from "../lib/supabase";
import { Button } from "../components/ui";
import { Logo } from "../components/layout/Logo";

function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden border-r border-white/[0.06] lg:flex flex-col justify-between p-12">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-1/2 size-[640px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-lime-400/10" />
          <div className="absolute left-1/2 top-1/2 size-[440px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-lime-400/15" />
          <div className="absolute left-1/2 top-1/2 size-[240px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-lime-400/25" />
          <div className="absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-lime-400"><span className="absolute inset-0 rounded-full bg-lime-400 animate-pulse-ring" /></div>
        </div>
        <Logo />
        <div className="max-w-md">
          <h2 className="heading text-4xl font-semibold leading-tight text-white">Encontre negócios. <span className="text-lime-400">Identifique oportunidades.</span> Conquiste clientes.</h2>
          <div className="mt-8 space-y-4 text-sm text-ink-200">
            {[[Radar, "Pesquisa real de estabelecimentos em qualquer cidade do Brasil"], [MapPin, "Verificação de sites e localização publicada"], [TrendingUp, "Pontuação de oportunidade, CRM e propostas em PDF"]].map(([I, t]: any) => (
              <div key={t} className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-lg bg-lime-400/10 text-lime-400"><I className="size-4" /></span>{t}</div>
            ))}
          </div>
        </div>
        <p className="text-xs text-ink-500">Dados comerciais públicos · LGPD</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm animate-slide-up">
          <div className="lg:hidden mb-10"><Logo /></div>
          <h1 className="heading text-2xl font-semibold text-white">{title}</h1>
          <p className="mt-1 text-sm text-ink-300">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}

function IconInput({ icon: Icon, ...props }: any) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
      <input {...props} className="input pl-10 h-11" />
    </div>
  );
}

export function LoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) return toast.error(error.message === "Invalid login credentials" ? "E-mail ou senha incorretos" : error.message);
    toast.success("Bem-vindo de volta!");
    nav("/");
  };
  return (
    <AuthLayout title="Entrar" subtitle="Acesse sua central de prospecção">
      <form onSubmit={submit} className="space-y-4">
        <IconInput icon={Mail} type="email" required placeholder="seu@email.com" value={email} onChange={(e: any) => setEmail(e.target.value)} autoComplete="email" />
        <IconInput icon={Lock} type="password" required placeholder="Senha" value={password} onChange={(e: any) => setPassword(e.target.value)} autoComplete="current-password" />
        <div className="flex justify-end"><Link to="/recuperar-senha" className="text-xs text-lime-400 hover:underline">Esqueci minha senha</Link></div>
        <Button type="submit" loading={loading} className="w-full h-11">Entrar <ArrowRight className="size-4" /></Button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-300">Ainda não tem conta? <Link to="/cadastro" className="text-lime-400 hover:underline">Criar conta</Link></p>
    </AuthLayout>
  );
}

export function SignupPage() {
  const nav = useNavigate();
  const [f, setF] = useState({ name: "", company: "", email: "", password: "" });
  const [accept, setAccept] = useState(false);
  const [loading, setLoading] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (f.password.length < 8) return toast.error("A senha deve ter ao menos 8 caracteres");
    if (!accept) return toast.error("É necessário aceitar os termos e a política de privacidade");
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: f.email.trim(), password: f.password,
      options: { data: { full_name: f.name.trim(), company: f.company.trim() }, emailRedirectTo: `${location.origin}/` },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    if (data.session) { toast.success("Conta criada!"); nav("/"); }
    else { toast.success("Conta criada! Confirme seu e-mail para entrar."); nav("/login"); }
  };
  return (
    <AuthLayout title="Criar conta" subtitle="Comece a prospectar com inteligência">
      <form onSubmit={submit} className="space-y-4">
        <IconInput icon={User} required placeholder="Seu nome" value={f.name} onChange={(e: any) => setF({ ...f, name: e.target.value })} />
        <IconInput icon={Building2} placeholder="Empresa / agência (opcional)" value={f.company} onChange={(e: any) => setF({ ...f, company: e.target.value })} />
        <IconInput icon={Mail} type="email" required placeholder="seu@email.com" value={f.email} onChange={(e: any) => setF({ ...f, email: e.target.value })} autoComplete="email" />
        <IconInput icon={Lock} type="password" required placeholder="Senha (mín. 8 caracteres)" value={f.password} onChange={(e: any) => setF({ ...f, password: e.target.value })} autoComplete="new-password" />
        <label className="flex items-start gap-2 text-xs text-ink-300">
          <input type="checkbox" className="mt-0.5 accent-lime-400" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
          <span>Concordo em utilizar apenas dados comerciais públicos, conforme a LGPD, e com os termos de uso das APIs integradas.</span>
        </label>
        <Button type="submit" loading={loading} className="w-full h-11">Criar conta <ArrowRight className="size-4" /></Button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-300">Já tem conta? <Link to="/login" className="text-lime-400 hover:underline">Entrar</Link></p>
    </AuthLayout>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/redefinir-senha` });
    setLoading(false);
    if (error) return toast.error(error.message);
    setSent(true);
  };
  return (
    <AuthLayout title="Recuperar senha" subtitle="Enviaremos um link para redefinir sua senha">
      {sent ? (
        <div className="card p-5 text-sm text-ink-200">Se houver uma conta para <b className="text-white">{email}</b>, você receberá um e-mail com o link de redefinição.</div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <IconInput icon={Mail} type="email" required placeholder="seu@email.com" value={email} onChange={(e: any) => setEmail(e.target.value)} />
          <Button type="submit" loading={loading} className="w-full h-11">Enviar link</Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm"><Link to="/login" className="text-lime-400 hover:underline">Voltar ao login</Link></p>
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const nav = useNavigate();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return toast.error("A senha deve ter ao menos 8 caracteres");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Senha atualizada!");
    nav("/");
  };
  return (
    <AuthLayout title="Nova senha" subtitle="Defina uma nova senha para sua conta">
      <form onSubmit={submit} className="space-y-4">
        <IconInput icon={Lock} type="password" required placeholder="Nova senha" value={password} onChange={(e: any) => setPassword(e.target.value)} autoComplete="new-password" />
        <Button type="submit" loading={loading} className="w-full h-11">Salvar nova senha</Button>
      </form>
    </AuthLayout>
  );
}

export function SetupRequired() {
  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="card max-w-xl p-8">
        <Logo />
        <h1 className="heading mt-6 text-xl font-semibold text-white">Configuração necessária</h1>
        <p className="mt-2 text-sm text-ink-300">O frontend ainda não está conectado ao Supabase. Crie o arquivo <code className="text-lime-400">.env.local</code> na raiz do projeto com:</p>
        <pre className="mt-4 overflow-x-auto rounded-xl bg-ink-950 p-4 text-xs text-ink-200 border border-white/5">{`VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon-publica
# opcional (mapa Google; sem ela é usado OpenStreetMap)
VITE_GOOGLE_MAPS_BROWSER_KEY=chave-restrita-por-referenciador`}</pre>
        <p className="mt-4 text-sm text-ink-300">Depois aplique as migrações (<code>supabase db push</code>), publique as Edge Functions (<code>supabase functions deploy</code>) e reinicie o servidor. Veja o README para o passo a passo completo.</p>
      </div>
    </div>
  );
}
