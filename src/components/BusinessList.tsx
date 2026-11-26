import { Link } from "react-router-dom";
import { clsx } from "clsx";
import { Star, Globe, Phone, MapPin, Camera as Instagram, MessageCircle, Heart } from "lucide-react";
import type { Business } from "../lib/types";
import { DigitalStatusBadge, OpportunityBadge } from "./ui/StatusBadges";
import { useFavorites } from "../hooks/useFavorites";

function Flag({ on, icon: Icon, title }: { on: boolean | null; icon: any; title: string }) {
  return <Icon aria-label={title} className={clsx("size-3.5", on === true ? "text-lime-400" : on === false ? "text-ink-500" : "text-ink-600")} />;
}

export function BusinessList({ items, selectable, selected, onToggle }: { items: Business[]; selectable?: boolean; selected?: Set<string>; onToggle?: (id: string) => void }) {
  const { favorites, toggle } = useFavorites();
  return (
    <>
      {/* Tabela (desktop) */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-ink-400 border-b border-white/[0.06]">
              {selectable && <th className="py-3 pl-4 w-8" />}
              <th className="py-3 pl-4">Estabelecimento</th>
              <th className="py-3">Localização</th>
              <th className="py-3">Presença digital</th>
              <th className="py-3">Sinais</th>
              <th className="py-3">Avaliação</th>
              <th className="py-3 pr-4">Oportunidade</th>
              <th className="py-3 pr-4 w-8" />
            </tr>
          </thead>
          <tbody>
            {items.map((b) => (
              <tr key={b.id} className="table-row">
                {selectable && (
                  <td className="pl-4"><input type="checkbox" className="accent-lime-400 size-4" checked={selected?.has(b.id)} onChange={() => onToggle?.(b.id)} /></td>
                )}
                <td className="py-3 pl-4 max-w-[280px]">
                  <Link to={`/estabelecimento/${b.id}`} className="font-medium text-white hover:text-lime-400 line-clamp-1">{b.name}</Link>
                  <div className="text-xs text-ink-400">{b.category ?? b.primary_type_label}</div>
                </td>
                <td className="py-3 text-xs text-ink-300 max-w-[220px]">
                  <div className="line-clamp-1">{b.neighborhood ?? b.street ?? "—"}</div>
                  <div className="text-ink-400">{[b.city, b.state].filter(Boolean).join(" / ")}</div>
                </td>
                <td className="py-3"><DigitalStatusBadge status={b.digital_status} /></td>
                <td className="py-3">
                  <div className="flex items-center gap-2">
                    <Flag on={b.has_own_site} icon={Globe} title="Site" />
                    <Flag on={b.phone ? true : null} icon={Phone} title="Telefone" />
                    <Flag on={b.has_whatsapp} icon={MessageCircle} title="WhatsApp" />
                    <Flag on={b.has_instagram} icon={Instagram} title="Instagram" />
                    <Flag on={b.site_has_location} icon={MapPin} title="Localização no site" />
                  </div>
                </td>
                <td className="py-3 text-xs text-ink-200">
                  {b.rating != null ? <span className="inline-flex items-center gap-1"><Star className="size-3.5 fill-amber-300 text-amber-300" />{b.rating} <span className="text-ink-400">({b.user_rating_count})</span></span> : "—"}
                </td>
                <td className="py-3 pr-4"><OpportunityBadge level={b.opportunity_level} score={b.opportunity_score} /></td>
                <td className="py-3 pr-4">
                  <button onClick={() => toggle(b.id)} aria-label="Favorito"><Heart className={clsx("size-4", favorites.has(b.id) ? "fill-rose-400 text-rose-400" : "text-ink-500 hover:text-rose-300")} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Cards (mobile) */}
      <div className="md:hidden divide-y divide-white/[0.05]">
        {items.map((b) => (
          <div key={b.id} className="flex gap-3 p-4">
            {selectable && <input type="checkbox" className="accent-lime-400 size-5 mt-1" checked={selected?.has(b.id)} onChange={() => onToggle?.(b.id)} />}
            <Link to={`/estabelecimento/${b.id}`} className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-white truncate">{b.name}</div>
                  <div className="text-xs text-ink-400 truncate">{b.category} · {b.neighborhood ?? b.city}</div>
                </div>
                {b.opportunity_score != null && <span className="heading text-lg font-semibold text-lime-400">{b.opportunity_score}</span>}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <DigitalStatusBadge status={b.digital_status} />
                {b.rating != null && <span className="text-xs text-ink-300 inline-flex items-center gap-1"><Star className="size-3 fill-amber-300 text-amber-300" />{b.rating} ({b.user_rating_count})</span>}
              </div>
            </Link>
            <button onClick={() => toggle(b.id)} aria-label="Favorito" className="self-start p-1"><Heart className={clsx("size-5", favorites.has(b.id) ? "fill-rose-400 text-rose-400" : "text-ink-500")} /></button>
          </div>
        ))}
      </div>
    </>
  );
}
