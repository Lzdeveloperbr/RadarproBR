import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { Filter, Save, Trash2, X, Bookmark } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CATEGORIES } from "../lib/constants";
import { FILTER_TOGGLES, countActive, type BusinessFilters } from "../lib/filters";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import { Button } from "./ui";

export function FilterPanel({ value, onChange, compact }: { value: BusinessFilters; onChange: (f: BusinessFilters) => void; compact?: boolean }) {
  const { user, orgId } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(!compact);
  const [radius, setRadius] = useState({ lat: value.radius?.lat?.toString() ?? "", lng: value.radius?.lng?.toString() ?? "", km: value.radius?.km?.toString() ?? "" });
  useEffect(() => setRadius({ lat: value.radius?.lat?.toString() ?? "", lng: value.radius?.lng?.toString() ?? "", km: value.radius?.km?.toString() ?? "" }), [value.radius]);

  const saved = useQuery({
    queryKey: ["saved_filters", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("saved_filters").select("*").eq("user_id", user!.id).order("created_at", { ascending: false })).data ?? [],
  });

  const set = (patch: Partial<BusinessFilters>) => onChange({ ...value, ...patch });
  const toggleLevel = (l: "alta" | "media" | "baixa") => {
    const cur = new Set(value.levels ?? []);
    if (cur.has(l)) cur.delete(l); else cur.add(l);
    set({ levels: [...cur] });
  };
  const saveCurrent = async () => {
    const name = prompt("Nome do filtro favorito:");
    if (!name?.trim()) return;
    const { error } = await supabase.from("saved_filters").insert({ user_id: user!.id, organization_id: orgId!, name: name.trim().slice(0, 80), filters: value });
    if (error) return toast.error("Não foi possível salvar: " + error.message);
    toast.success("Filtro salvo");
    qc.invalidateQueries({ queryKey: ["saved_filters"] });
  };
  const removeSaved = async (id: string) => {
    await supabase.from("saved_filters").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["saved_filters"] });
  };
  const applyRadius = () => {
    const lat = Number(radius.lat), lng = Number(radius.lng), km = Number(radius.km);
    if (!radius.lat && !radius.lng && !radius.km) return set({ radius: null });
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !(km > 0)) return toast.error("Informe latitude, longitude e raio válidos");
    set({ radius: { lat, lng, km } });
  };
  const active = countActive(value);

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => setOpen(!open)} className="flex items-center gap-2 text-sm font-medium text-white">
          <Filter className="size-4 text-lime-400" /> Filtros avançados
          {active > 0 && <span className="rounded-full bg-lime-400 px-1.5 text-[10px] font-bold text-ink-950">{active}</span>}
        </button>
        <div className="flex gap-1">
          {active > 0 && <Button size="sm" variant="ghost" icon={X} onClick={() => onChange({ sort: value.sort, searchId: value.searchId })}>Limpar</Button>}
          <Button size="sm" variant="secondary" icon={Save} onClick={saveCurrent}>Salvar</Button>
        </div>
      </div>
      {(saved.data?.length ?? 0) > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {saved.data!.map((s: any) => (
            <span key={s.id} className="chip pr-1.5">
              <button className="flex items-center gap-1" onClick={() => onChange(s.filters)}><Bookmark className="size-3" />{s.name}</button>
              <button onClick={() => removeSaved(s.id)} className="text-ink-400 hover:text-rose-300" aria-label="Remover"><Trash2 className="size-3" /></button>
            </span>
          ))}
        </div>
      )}
      {open && (
        <div className="mt-4 space-y-4 animate-fade-in">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <input className="input" placeholder="Buscar por nome, endereço..." value={value.q ?? ""} onChange={(e) => set({ q: e.target.value || undefined })} />
            <input className="input" placeholder="Cidade" value={value.city ?? ""} onChange={(e) => set({ city: e.target.value || undefined })} />
            <input className="input" placeholder="Bairro" value={value.neighborhood ?? ""} onChange={(e) => set({ neighborhood: e.target.value || undefined })} />
            <select className="input" value={value.category ?? ""} onChange={(e) => set({ category: e.target.value || undefined })}>
              <option value="">Todas as categorias</option>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FILTER_TOGGLES.map((t) => (
              <button key={t.key} onClick={() => set({ [t.key]: !value[t.key] || undefined } as any)} className={clsx("chip", value[t.key] && "chip-active")}>{t.label}</button>
            ))}
            {(["alta", "media", "baixa"] as const).map((l) => (
              <button key={l} onClick={() => toggleLevel(l)} className={clsx("chip", value.levels?.includes(l) && "chip-active")}>Oportunidade {l === "media" ? "média" : l}</button>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_120px_auto_auto] items-end">
            <input className="input" placeholder="Latitude do centro" value={radius.lat} onChange={(e) => setRadius({ ...radius, lat: e.target.value })} />
            <input className="input" placeholder="Longitude do centro" value={radius.lng} onChange={(e) => setRadius({ ...radius, lng: e.target.value })} />
            <input className="input" placeholder="Raio (km)" value={radius.km} onChange={(e) => setRadius({ ...radius, km: e.target.value })} />
            <Button variant="secondary" onClick={applyRadius}>Aplicar raio</Button>
            <Button variant="ghost" onClick={() => {
              if (!navigator.geolocation) return toast.error("Geolocalização indisponível");
              navigator.geolocation.getCurrentPosition(
                (p) => set({ radius: { lat: p.coords.latitude, lng: p.coords.longitude, km: Number(radius.km) || 5 } }),
                () => toast.error("Permissão de localização negada"),
              );
            }}>Perto de mim</Button>
          </div>
          <div className="flex items-center gap-2 text-xs text-ink-300">
            Ordenar por:
            {([["score", "Pontuação"], ["name", "Nome"], ["rating", "Avaliações"], ["recent", "Recentes"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => set({ sort: k })} className={clsx("chip py-1", (value.sort ?? "score") === k && "chip-active")}>{l}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
