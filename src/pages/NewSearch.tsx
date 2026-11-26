import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Radar, MapPin, Sparkles, Crosshair, Info } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useBatchRunner } from "../hooks/useBatchRunner";
import { Button, Card, CardHeader, Field, PageHeader, Toggle } from "../components/ui";
import { CategoryPicker } from "../components/CategoryPicker";
import { MapView } from "../components/MapView";
import { DIGITAL_FILTERS, UFS } from "../lib/constants";
import { errorMessage } from "../lib/api";

const EXAMPLES = [
  { label: "Barbearias em São José do Rio Preto", city: "São José do Rio Preto", state: "SP", cats: ["Barbearias"], filter: "all" },
  { label: "Restaurantes em Votuporanga", city: "Votuporanga", state: "SP", cats: ["Restaurantes"], filter: "all" },
  { label: "Oficinas mecânicas em Fernandópolis", city: "Fernandópolis", state: "SP", cats: ["Oficinas mecânicas"], filter: "all" },
  { label: "Clínicas odontológicas com sites com problemas", city: "", state: "", cats: ["Clínicas odontológicas"], filter: "issues" },
];

export function NewSearchPage() {
  const { settings } = useAuth();
  const runner = useBatchRunner();
  const nav = useNavigate();
  const [f, setF] = useState({
    country: "Brasil", state: "", city: "", neighborhood: "", categories: [] as string[], custom: "",
    radius: 10, max: 60, filter: "all", wholeCity: false, autoAudit: true,
  });
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [useCenter, setUseCenter] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setF((p) => ({ ...p, country: settings.default_country ?? "Brasil", state: settings.default_state ?? "", city: settings.default_city ?? "",
      radius: settings.default_radius_km ?? 10, max: settings.default_max_results ?? 60, autoAudit: settings.auto_audit ?? true }));
  }, [settings]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.city.trim() && !(useCenter && center)) return toast.error("Informe a cidade (ou marque um ponto no mapa)");
    if (!f.categories.length && !f.custom.trim()) return toast.error("Selecione ao menos uma categoria ou informe uma categoria personalizada");
    setLoading(true);
    try {
      const params = {
        country: f.country, state: f.state, city: f.city.trim(), neighborhood: f.neighborhood.trim(), categories: f.categories,
        custom_category: f.custom.trim(), radius_km: f.radius, max_results: f.max, digital_filter: f.filter, whole_city: f.wholeCity,
        center: useCenter ? center : null,
      };
      const cats = [...f.categories, f.custom.trim()].filter(Boolean);
      const name = `${cats.slice(0, 3).join(", ")}${cats.length > 3 ? ` +${cats.length - 3}` : ""} — ${f.city || "ponto no mapa"}${f.state ? "/" + f.state : ""}`;
      const jobId = await runner.createJob(name, "search", [{ type: "search", params, auto_audit: f.autoAudit }]);
      toast.success("Pesquisa iniciada! Acompanhe o progresso em tempo real.");
      nav(`/lote/${jobId}?filter=${f.filter}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageHeader title="Nova pesquisa" subtitle="Encontre estabelecimentos reais via Google Places e investigue a presença digital de cada um" icon={Radar} />
      <form onSubmit={submit} className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Localização" icon={MapPin} />
            <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2">
              <Field label="1. País"><input className="input" value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })} /></Field>
              <Field label="2. Estado">
                <select className="input" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })}>
                  <option value="">Selecione</option>
                  {UFS.map(([uf, n]) => <option key={uf} value={uf}>{n} ({uf})</option>)}
                </select>
              </Field>
              <Field label="3. Cidade"><input className="input" placeholder="Ex.: São José do Rio Preto" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></Field>
              <Field label="4. Bairro (opcional)"><input className="input" placeholder="Ex.: Centro" value={f.neighborhood} onChange={(e) => setF({ ...f, neighborhood: e.target.value })} /></Field>
              <Field label={`6. Raio de pesquisa: ${f.radius} km`} hint="A Places API aceita raio de até 50 km por consulta; resultados fora do raio são descartados.">
                <input type="range" min={1} max={50} value={f.radius} onChange={(e) => setF({ ...f, radius: Number(e.target.value) })} className="w-full accent-lime-400" />
              </Field>
              <Field label="7. Quantidade máxima de resultados" hint="Até 300 por pesquisa. Acima de 60 por categoria o sistema divide a área em grade (mais chamadas à API).">
                <input type="number" min={1} max={300} className="input" value={f.max} onChange={(e) => setF({ ...f, max: Math.max(1, Math.min(300, Number(e.target.value) || 1)) })} />
              </Field>
              <div className="sm:col-span-2 flex flex-wrap gap-5 pt-1">
                <Toggle checked={f.wholeCity} onChange={(v) => setF({ ...f, wholeCity: v })} label="Pesquisar a cidade inteira (ajusta o raio à área do município)" />
                <Toggle checked={useCenter} onChange={setUseCenter} label="Usar ponto marcado no mapa como centro (proximidade)" />
              </div>
            </div>
          </Card>
          <Card>
            <CardHeader title="5. Categorias comerciais" subtitle="Selecione uma ou várias categorias" icon={Sparkles} />
            <div className="px-5 pb-5 space-y-4">
              <CategoryPicker value={f.categories} onChange={(categories) => setF({ ...f, categories })} />
              <Field label="Categoria personalizada (Outros)"><input className="input" placeholder="Ex.: estúdio de tatuagem" value={f.custom} onChange={(e) => setF({ ...f, custom: e.target.value })} /></Field>
            </div>
          </Card>
          <Card>
            <CardHeader title="8. Filtro de presença digital" subtitle="Aplicado na visualização dos resultados após a análise" icon={Crosshair} />
            <div className="px-5 pb-5 flex flex-wrap gap-1.5">
              {DIGITAL_FILTERS.map((d) => (
                <button type="button" key={d.key} onClick={() => setF({ ...f, filter: d.key })} className={`chip ${f.filter === d.key ? "chip-active" : ""}`}>{d.label}</button>
              ))}
            </div>
            <div className="px-5 pb-5"><Toggle checked={f.autoAudit} onChange={(v) => setF({ ...f, autoAudit: v })} label="Executar análise de presença digital automaticamente após a pesquisa" /></div>
          </Card>
        </div>
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-white">Ponto central (opcional)</span>
              <Button type="button" size="sm" variant="ghost" icon={Crosshair} onClick={() => navigator.geolocation?.getCurrentPosition(
                (p) => { setCenter({ lat: p.coords.latitude, lng: p.coords.longitude }); setUseCenter(true); },
                () => toast.error("Permissão de localização negada"))}>Minha localização</Button>
            </div>
            <MapView businesses={[]} className="h-64 w-full rounded-xl overflow-hidden" circle={center ? { ...center, km: f.radius } : null}
              onMapClick={(lat, lng) => { setCenter({ lat, lng }); setUseCenter(true); }} />
            <p className="mt-2 text-[11px] text-ink-400">{center ? `Centro: ${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}` : "Clique no mapa para pesquisar por proximidade."}</p>
          </Card>
          <Card className="p-4">
            <div className="text-sm font-medium text-white mb-2">Exemplos de pesquisa</div>
            <div className="space-y-1.5">
              {EXAMPLES.map((ex) => (
                <button type="button" key={ex.label} className="w-full text-left rounded-lg px-3 py-2 text-xs text-ink-200 hover:bg-white/[0.04] hover:text-lime-400"
                  onClick={() => setF({ ...f, city: ex.city || f.city, state: ex.state || f.state, categories: ex.cats, filter: ex.filter })}>{ex.label}</button>
              ))}
            </div>
          </Card>
          <Card className="p-4 text-xs text-ink-300 space-y-2">
            <div className="flex items-center gap-2 text-white font-medium text-sm"><Info className="size-4 text-lime-400" />Como funciona</div>
            <p>1. A pesquisa consulta a Google Places API pelo backend (sua chave nunca é exposta).</p>
            <p>2. Cada estabelecimento é salvo sem duplicação (ID do Google + nome/telefone).</p>
            <p>3. A análise verifica o site informado, pesquisa na web quando configurada, lê o conteúdo público respeitando o robots.txt e calcula a pontuação de oportunidade.</p>
            <p>Nenhum resultado é simulado. Sem a chave configurada, a pesquisa informa o que falta.</p>
          </Card>
          <Button type="submit" size="lg" loading={loading} icon={Radar} className="w-full">Iniciar pesquisa</Button>
        </div>
      </form>
    </>
  );
}
