import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Upload, FileDown } from "lucide-react";
import { Button, Field, Modal, ProgressBar, Toggle } from "./ui";
import { createManualBusiness, parseCsv, csvRowToInput, type ManualBusinessInput } from "../lib/services";
import { CATEGORIES, UFS } from "../lib/constants";
import { exportCSV } from "../lib/export";

export function AddBusinessButton() {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<ManualBusinessInput>({ name: "", geocode: true });
  const [saving, setSaving] = useState(false);
  const nav = useNavigate();
  const qc = useQueryClient();
  const set = (p: Partial<ManualBusinessInput>) => setF({ ...f, ...p });
  const save = async () => {
    setSaving(true);
    try {
      const r = await createManualBusiness(f);
      toast[r.created ? "success" : "info"](r.created ? "Estabelecimento cadastrado" : "Este estabelecimento já estava na base");
      qc.invalidateQueries();
      setOpen(false);
      setF({ name: "", geocode: true });
      nav(`/estabelecimento/${r.id}`);
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };
  return (
    <>
      <Button size="sm" variant="secondary" icon={Plus} onClick={() => setOpen(true)}>Adicionar</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Adicionar estabelecimento manualmente"
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button loading={saving} onClick={save}>Salvar</Button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="Nome *"><input className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} /></Field></div>
          <Field label="Categoria"><select className="input" value={f.category ?? ""} onChange={(e) => set({ category: e.target.value })}><option value="">—</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Telefone"><input className="input" value={f.phone ?? ""} onChange={(e) => set({ phone: e.target.value })} /></Field>
          <Field label="WhatsApp"><input className="input" value={f.whatsapp ?? ""} onChange={(e) => set({ whatsapp: e.target.value })} /></Field>
          <Field label="Instagram"><input className="input" placeholder="@usuario" value={f.instagram ?? ""} onChange={(e) => set({ instagram: e.target.value })} /></Field>
          <div className="sm:col-span-2"><Field label="Site"><input className="input" placeholder="https://..." value={f.website ?? ""} onChange={(e) => set({ website: e.target.value })} /></Field></div>
          <div className="sm:col-span-2"><Field label="Endereço"><input className="input" placeholder="Rua, número" value={f.address ?? ""} onChange={(e) => set({ address: e.target.value })} /></Field></div>
          <Field label="Bairro"><input className="input" value={f.neighborhood ?? ""} onChange={(e) => set({ neighborhood: e.target.value })} /></Field>
          <Field label="Cidade"><input className="input" value={f.city ?? ""} onChange={(e) => set({ city: e.target.value })} /></Field>
          <Field label="UF"><select className="input" value={f.state ?? ""} onChange={(e) => set({ state: e.target.value })}><option value="">—</option>{UFS.map(([uf]) => <option key={uf}>{uf}</option>)}</select></Field>
          <div className="sm:col-span-2"><Toggle checked={!!f.geocode} onChange={(v) => set({ geocode: v })} label="Localizar no mapa pelo endereço (OpenStreetMap)" /></div>
        </div>
      </Modal>
    </>
  );
}

export function ImportCsvButton() {
  const ref = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const [progress, setProgress] = useState<{ done: number; total: number; created: number } | null>(null);
  const run = async (file: File) => {
    try {
      const rows = parseCsv(await file.text()).map(csvRowToInput).filter((r) => r.name);
      if (!rows.length) return toast.error("Nenhuma linha com a coluna \"nome\" encontrada");
      if (rows.length > 2000) return toast.error("Máximo de 2.000 linhas por importação");
      let created = 0;
      setProgress({ done: 0, total: rows.length, created: 0 });
      for (let i = 0; i < rows.length; i++) {
        try { if ((await createManualBusiness({ ...rows[i], geocode: false })).created) created++; } catch { /* linha inválida */ }
        setProgress({ done: i + 1, total: rows.length, created });
      }
      toast.success(`${created} estabelecimentos importados (${rows.length - created} já existiam ou eram inválidos)`);
      qc.invalidateQueries();
    } catch (e: any) { toast.error(e.message); } finally { setProgress(null); }
  };
  const template = () => exportCSV([{ nome: "Exemplo Barbearia", categoria: "Barbearias", telefone: "(17) 3421-0000", whatsapp: "17999990000", endereco: "Rua Exemplo, 100", bairro: "Centro", cidade: "Votuporanga", uf: "SP", site: "", instagram: "@exemplo" }], "modelo-importacao-radar");
  return (
    <>
      <Button size="sm" variant="secondary" icon={Upload} onClick={() => ref.current?.click()}>Importar CSV</Button>
      <button className="text-[11px] text-ink-400 hover:text-lime-400 inline-flex items-center gap-1" onClick={template}><FileDown className="size-3" />modelo</button>
      <input ref={ref} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) run(f); e.target.value = ""; }} />
      <Modal open={!!progress} onClose={() => {}} title="Importando planilha">
        {progress && <div className="space-y-2"><ProgressBar value={(progress.done / progress.total) * 100} /><p className="text-sm text-ink-300">{progress.done} de {progress.total} · {progress.created} novos</p></div>}
      </Modal>
    </>
  );
}
