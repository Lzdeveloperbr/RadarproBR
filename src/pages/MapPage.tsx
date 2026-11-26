import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Map as MapIcon, Navigation, ExternalLink, X, Globe, Phone, Star } from "lucide-react";
import { fetchBusinesses, type BusinessFilters } from "../lib/filters";
import type { Business } from "../lib/types";
import { Button, Card, PageHeader } from "../components/ui";
import { FilterPanel } from "../components/FilterPanel";
import { MapView, MapLegend } from "../components/MapView";
import { DigitalStatusBadge, OpportunityBadge } from "../components/ui/StatusBadges";
import { mapsRoute } from "../lib/format";

export function MapPage() {
  const [filters, setFilters] = useState<BusinessFilters>({});
  const [sel, setSel] = useState<Business | null>(null);
  const q = useQuery({ queryKey: ["businesses", "map", filters], queryFn: () => fetchBusinesses(filters, 5000) });
  const items = q.data ?? [];
  const located = items.filter((b) => b.lat != null).length;

  return (
    <>
      <PageHeader title="Mapa de estabelecimentos" subtitle={`${located} de ${items.length} estabelecimentos com localização`} icon={MapIcon} />
      <FilterPanel value={filters} onChange={setFilters} compact />
      <div className="mt-4 relative">
        <Card className="p-2">
          <MapView businesses={items} onSelect={setSel} selectedId={sel?.id} className="h-[calc(100vh-280px)] min-h-[420px] w-full rounded-xl overflow-hidden" circle={filters.radius ?? null} />
        </Card>
        <div className="mt-3"><MapLegend /></div>
        {sel && (
          <div className="absolute left-3 right-3 bottom-12 sm:left-auto sm:right-5 sm:top-5 sm:bottom-auto sm:w-96 z-[500] card bg-ink-850/95 p-4 animate-slide-up">
            <button className="absolute right-3 top-3 text-ink-400 hover:text-white" onClick={() => setSel(null)} aria-label="Fechar"><X className="size-4" /></button>
            <div className="pr-6">
              <div className="heading font-semibold text-white">{sel.name}</div>
              <div className="text-xs text-ink-400">{sel.category} · {sel.formatted_address}</div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5"><DigitalStatusBadge status={sel.digital_status} /><OpportunityBadge level={sel.opportunity_level} score={sel.opportunity_score} /></div>
            <div className="mt-3 space-y-1 text-xs text-ink-300">
              {sel.osm_url && <a className="text-lime-400 hover:underline" href={sel.osm_url} target="_blank" rel="noreferrer">Ver no OpenStreetMap</a>}
              {sel.rating != null && <div className="flex items-center gap-1.5"><Star className="size-3.5 text-amber-300" />{sel.rating} ({sel.user_rating_count} avaliações)</div>}
              {sel.phone && <div className="flex items-center gap-1.5"><Phone className="size-3.5" />{sel.phone}</div>}
              <div className="flex items-center gap-1.5"><Globe className="size-3.5" />{sel.primary_website ?? "Site próprio não identificado"}</div>
              <div className="text-ink-500">{sel.lat?.toFixed(6)}, {sel.lng?.toFixed(6)}</div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Link to={`/estabelecimento/${sel.id}`}><Button size="sm" className="w-full">Detalhes</Button></Link>
              <a href={mapsRoute(sel)} target="_blank" rel="noreferrer"><Button size="sm" variant="secondary" icon={Navigation} className="w-full">Rota</Button></a>
              <a href={sel.google_maps_uri ?? `https://www.google.com/maps/search/?api=1&query=${sel.lat},${sel.lng}`} target="_blank" rel="noreferrer"><Button size="sm" variant="secondary" icon={ExternalLink} className="w-full">Maps</Button></a>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
