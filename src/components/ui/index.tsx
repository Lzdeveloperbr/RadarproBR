import { clsx } from "clsx";
import { Loader2, X, Inbox } from "lucide-react";
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
const variants: Record<Variant, string> = {
  primary: "bg-lime-400 text-ink-950 hover:bg-lime-500 shadow-[0_0_0_1px_rgba(198,244,50,.4),0_8px_24px_-8px_rgba(198,244,50,.5)]",
  secondary: "bg-white/[0.06] text-ink-100 hover:bg-white/[0.1] border border-white/[0.08]",
  outline: "border border-lime-400/40 text-lime-400 hover:bg-lime-400/10",
  ghost: "text-ink-200 hover:bg-white/[0.06] hover:text-white",
  danger: "bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25",
};

export function Button({
  variant = "primary", size = "md", loading, icon: Icon, children, className, disabled, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; loading?: boolean; icon?: LucideIcon }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap",
        size === "sm" && "h-8 px-3 text-xs",
        size === "md" && "h-10 px-4 text-sm",
        size === "lg" && "h-12 px-6 text-base",
        variants[variant],
        className,
      )}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : Icon ? <Icon className="size-4" /> : null}
      {children}
    </button>
  );
}

export function Card({ children, className, ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={clsx("card", className)}>{children}</div>;
}

export function CardHeader({ title, subtitle, icon: Icon, action }: { title: ReactNode; subtitle?: ReactNode; icon?: LucideIcon; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
      <div className="flex items-center gap-3 min-w-0">
        {Icon && <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-lime-400/10 text-lime-400"><Icon className="size-4.5" /></div>}
        <div className="min-w-0">
          <h3 className="heading text-[15px] font-semibold text-white truncate">{title}</h3>
          {subtitle && <p className="text-xs text-ink-300 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={clsx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap", className ?? "border-white/10 bg-white/5 text-ink-200")}>{children}</span>;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx("animate-spin text-lime-400", className ?? "size-5")} />;
}

export function PageLoader({ label = "Carregando..." }: { label?: string }) {
  return <div className="flex flex-col items-center justify-center gap-3 py-24 text-sm text-ink-300"><Spinner className="size-7" />{label}</div>;
}

export function EmptyState({ icon: Icon = Inbox, title, description, action }: { icon?: LucideIcon; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-3 py-16 px-6">
      <div className="grid size-14 place-items-center rounded-2xl bg-white/[0.04] border border-white/[0.06]"><Icon className="size-6 text-ink-300" /></div>
      <div>
        <p className="heading font-semibold text-white">{title}</p>
        {description && <div className="text-sm text-ink-300 mt-1 max-w-md">{description}</div>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, icon: Icon }: { title: string; subtitle?: ReactNode; actions?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6 animate-slide-up">
      <div className="flex items-center gap-3">
        {Icon && <div className="hidden sm:grid size-11 place-items-center rounded-2xl bg-lime-400/10 text-lime-400 border border-lime-400/20"><Icon className="size-5" /></div>}
        <div>
          <h1 className="heading text-2xl sm:text-[28px] font-semibold text-white">{title}</h1>
          {subtitle && <p className="text-sm text-ink-300 mt-1">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, icon: Icon, hint, accent, onClick }: { label: string; value: ReactNode; icon: LucideIcon; hint?: ReactNode; accent?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick} disabled={!onClick} className={clsx("card p-4 text-left transition group disabled:cursor-default", onClick && "hover:border-lime-400/30 hover:-translate-y-0.5")}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-ink-300 font-medium">{label}</span>
        <Icon className={clsx("size-4", accent ? "text-lime-400" : "text-ink-400 group-hover:text-lime-400")} />
      </div>
      <div className={clsx("heading text-2xl font-semibold mt-2", accent ? "text-lime-400" : "text-white")}>{value}</div>
      {hint && <div className="text-[11px] text-ink-400 mt-1">{hint}</div>}
    </button>
  );
}

export function Modal({ open, onClose, title, children, wide, footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className={clsx("relative card w-full max-h-[92vh] flex flex-col rounded-b-none sm:rounded-2xl animate-slide-up bg-ink-850", wide ? "sm:max-w-4xl" : "sm:max-w-lg")}>
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <h3 className="heading font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink-300 hover:bg-white/5 hover:text-white" aria-label="Fechar"><X className="size-4" /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4 flex-1">{children}</div>
        {footer && <div className="border-t border-white/[0.06] px-5 py-3 flex justify-end gap-2 safe-bottom">{footer}</div>}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { key: T; label: string; icon?: LucideIcon }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-xl bg-white/[0.03] border border-white/[0.06] p-1 no-scrollbar">
      {tabs.map((t) => (
        <button key={t.key} onClick={() => onChange(t.key)}
          className={clsx("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition",
            value === t.key ? "bg-lime-400 text-ink-950" : "text-ink-300 hover:text-white hover:bg-white/5")}>
          {t.icon && <t.icon className="size-3.5" />}{t.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-ink-400 mt-1">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-center gap-3 text-sm text-ink-200">
      <span className={clsx("relative h-5 w-9 rounded-full transition", checked ? "bg-lime-400" : "bg-ink-600")}>
        <span className={clsx("absolute top-0.5 size-4 rounded-full bg-ink-950 transition-all", checked ? "left-[18px]" : "left-0.5")} />
      </span>
      {label}
    </button>
  );
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={clsx("h-2 w-full overflow-hidden rounded-full bg-white/[0.06]", className)}>
      <div className="h-full rounded-full bg-gradient-to-r from-lime-600 to-lime-400 transition-all duration-500" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function ScoreRing({ score, size = 56 }: { score: number | null; size?: number }) {
  const s = score ?? 0;
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  const color = s >= 60 ? "#c6f432" : s >= 30 ? "#fcd34d" : "#8a93a6";
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,.08)" strokeWidth="5" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth="5" fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (c * s) / 100} style={{ transition: "stroke-dashoffset .8s ease" }} />
      </svg>
      <span className="absolute heading text-sm font-semibold" style={{ color }}>{score ?? "—"}</span>
    </div>
  );
}
