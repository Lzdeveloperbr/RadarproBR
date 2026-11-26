// Mapa interativo gratuito: Leaflet + OpenStreetMap/CARTO.
// Marcadores coloridos por presença digital e agrupamento de estabelecimentos próximos.
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import type { Business } from "../lib/types";
import { DIGITAL_STATUS } from "../lib/constants";


export interface MapProps {
  businesses: Business[];
  onSelect?: (b: Business) => void;
  selectedId?: string | null;
  className?: string;
  circle?: { lat: number; lng: number; km: number } | null;
  onMapClick?: (lat: number, lng: number) => void;
}

const colorOf = (b: Business) => (DIGITAL_STATUS[b.digital_status] ?? DIGITAL_STATUS.unknown).hex;
const located = (list: Business[]) => list.filter((b) => b.lat != null && b.lng != null);

function LeafletMap({ businesses, onSelect, selectedId, className, circle, onMapClick }: MapProps) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<any>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const clickRef = useRef(onMapClick);
  clickRef.current = onMapClick;

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = L.map(ref.current, { zoomControl: true, attributionControl: true }).setView([-15.78, -47.93], 4);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 20,
    }).addTo(map);
    clusterRef.current = (L as any).markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 45 });
    map.addLayer(clusterRef.current);
    map.on("click", (e: L.LeafletMouseEvent) => clickRef.current?.(e.latlng.lat, e.latlng.lng));
    mapRef.current = map;
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(ref.current);
    return () => { ro.disconnect(); map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current, cluster = clusterRef.current;
    if (!map || !cluster) return;
    cluster.clearLayers();
    const pts = located(businesses);
    const markers = pts.map((b) => {
      const sel = b.id === selectedId;
      const icon = L.divIcon({
        className: "",
        iconSize: [sel ? 26 : 18, sel ? 26 : 18],
        html: `<div style="width:100%;height:100%;border-radius:9999px;background:${colorOf(b)};border:${sel ? 3 : 2}px solid #08090c;box-shadow:0 0 0 ${sel ? 3 : 1}px ${colorOf(b)}88,0 4px 10px rgba(0,0,0,.5)"></div>`,
      });
      const m = L.marker([b.lat!, b.lng!], { icon, title: b.name });
      m.bindTooltip(`<b>${b.name.replace(/</g, "&lt;")}</b><br/>${(b.category ?? "").replace(/</g, "&lt;")}`, { direction: "top", offset: [0, -8] });
      m.on("click", () => onSelect?.(b));
      return m;
    });
    cluster.addLayers(markers);
    if (pts.length && !selectedId) {
      map.fitBounds(L.latLngBounds(pts.map((b) => [b.lat!, b.lng!] as [number, number])), { padding: [40, 40], maxZoom: 15 });
    }
  }, [businesses, selectedId, onSelect]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    circleRef.current?.remove();
    if (circle) {
      circleRef.current = L.circle([circle.lat, circle.lng], { radius: circle.km * 1000, color: "#c6f432", weight: 1, fillOpacity: 0.04 }).addTo(map);
      if (!located(businesses).length) map.fitBounds(circleRef.current.getBounds());
    }
  }, [circle, businesses]);

  useEffect(() => {
    const b = businesses.find((x) => x.id === selectedId);
    if (b?.lat != null && mapRef.current) mapRef.current.setView([b.lat, b.lng!], Math.max(mapRef.current.getZoom(), 16), { animate: true });
  }, [selectedId, businesses]);

  return <div ref={ref} className={className ?? "h-[520px] w-full rounded-2xl overflow-hidden"} />;
}

export function MapView(props: MapProps) {
  return <LeafletMap {...props} />;
}

export function MapLegend() {
  return (
    <div className="flex flex-wrap gap-3 text-[11px] text-ink-300">
      {(["has_site", "no_site", "site_issues", "site_pending", "unknown"] as const).map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: DIGITAL_STATUS[k].hex }} />{DIGITAL_STATUS[k].label}</span>
      ))}
    </div>
  );
}
