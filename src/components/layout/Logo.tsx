export function LogoMark({ className = "size-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <radialGradient id="rg" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#c6f432" stopOpacity=".35" /><stop offset="100%" stopColor="#c6f432" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="#0d0f14" />
      <circle cx="32" cy="32" r="26" fill="url(#rg)" />
      <circle cx="32" cy="32" r="20" fill="none" stroke="#c6f432" strokeOpacity=".35" strokeWidth="2" />
      <circle cx="32" cy="32" r="11" fill="none" stroke="#c6f432" strokeOpacity=".6" strokeWidth="2" />
      <path d="M32 32 L50 18" stroke="#c6f432" strokeWidth="3" strokeLinecap="round" />
      <circle cx="32" cy="32" r="3.5" fill="#c6f432" />
      <circle cx="44" cy="40" r="3" fill="#c6f432" />
    </svg>
  );
}

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      <div className="leading-tight">
        <div className="heading text-[15px] font-bold text-white tracking-tight">RADAR <span className="text-lime-400">LOCAL</span> PRO</div>
        <div className="text-[10px] text-ink-400 tracking-wider uppercase">Inteligência comercial</div>
      </div>
    </div>
  );
}
