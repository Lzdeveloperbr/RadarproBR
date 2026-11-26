import { useState } from "react";
import { toast } from "sonner";
import { ClipboardCheck, ExternalLink } from "lucide-react";
import { Button, Card, CardHeader } from "../ui";
import { MANUAL_CHECKS, auditBusiness } from "../../lib/services";
import type { Check } from "../../lib/types";

/** Verificação manual do conteúdo do site (o navegador não pode ler sites de terceiros automaticamente). */
export function ManualChecklist({ businessId, url, checks, onDone }: { businessId: string; url: string; checks: Record<string, Check>; onDone: () => void }) {
  const [vals, setVals] = useState<Record<string, boolean | null>>(() => Object.fromEntries(MANUAL_CHECKS.map((c) => [c.key, checks[c.key]?.manual ? checks[c.key].value : null])));
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      const r = await auditBusiness(businessId, vals);
      toast.success(`Checklist salvo · pontuação ${r.opportunity.score}`);
      onDone();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };
  const opt = (k: string, v: boolean | null, label: string) => (
    <button onClick={() => setVals({ ...vals, [k]: v })} className={`chip py-1 ${vals[k] === v ? (v === true ? "chip-active" : v === false ? "!border-rose-400/60 !text-rose-300 !bg-rose-400/10" : "chip-active") : ""}`}>{label}</button>
  );
  return (
    <Card>
      <CardHeader title="Checklist do site" icon={ClipboardCheck} subtitle="Abra o site e marque o que encontrou — a pontuação é recalculada com fatos verificados por você"
        action={<a href={url} target="_blank" rel="noreferrer"><Button size="sm" variant="secondary" icon={ExternalLink}>Abrir site</Button></a>} />
      <div className="px-5 pb-5 space-y-2">
        {MANUAL_CHECKS.map((c) => (
          <div key={c.key} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between rounded-lg px-2 py-1.5 hover:bg-white/[0.02]">
            <span className="text-sm text-ink-100">{c.label}</span>
            <div className="flex gap-1.5">{opt(c.key, true, "Sim")}{opt(c.key, false, "Não")}{opt(c.key, null, "Não sei")}</div>
          </div>
        ))}
        <div className="pt-2"><Button loading={saving} onClick={save}>Salvar checklist e recalcular</Button></div>
      </div>
    </Card>
  );
}
