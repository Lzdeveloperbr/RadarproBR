import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldCheck, Download, Upload, Trash2, Activity, HardDrive } from "lucide-react";
import { db, exportBackup, importBackup, clearAll } from "../lib/db";
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, PageLoader, StatCard } from "../components/ui";
import { fmtDateTime, fmtNumber } from "../lib/format";

export function DataPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ["data-page"],
    queryFn: async () => {
      const est = await navigator.storage?.estimate?.().catch(() => null);
      const persisted = await navigator.storage?.persisted?.().catch(() => false);
      return {
        counts: { businesses: await db.businesses.count(), leads: await db.leads.count(), proposals: await db.proposals.count(), searches: await db.searches.count() },
        usageMb: est?.usage ? est.usage / 1024 / 1024 : null, persisted,
        logs: await db.activity.orderBy("created_at").reverse().limit(100).toArray(),
      };
    },
  });
  const download = async () => {
    const blob = await exportBackup();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `radar-local-pro-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    toast.success("Backup baixado");
  };
  const restore = async (file: File) => {
    const mode = confirm("OK = substituir todos os dados atuais pelo backup.\nCancelar = juntar o backup com os dados atuais.") ? "replace" : "merge";
    setBusy(true);
    try { await importBackup(file, mode); toast.success("Backup restaurado"); qc.invalidateQueries(); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  const wipe = async () => {
    if (!confirm("Apagar TODOS os dados deste navegador? Faça um backup antes.")) return;
    await clearAll();
    qc.invalidateQueries();
    toast.success("Dados apagados");
  };
  const persist = async () => {
    const ok = await navigator.storage?.persist?.();
    toast[ok ? "success" : "error"](ok ? "Armazenamento protegido contra limpeza automática" : "O navegador não permitiu — faça backups regulares");
    q.refetch();
  };
  if (q.isLoading || !q.data) return <PageLoader />;
  const d = q.data;
  return (
    <>
      <PageHeader title="Dados e backup" subtitle="Seus dados ficam apenas neste navegador — exporte para guardar ou levar para outro aparelho" icon={ShieldCheck} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 mb-4">
        <StatCard label="Estabelecimentos" value={fmtNumber(d.counts.businesses)} icon={HardDrive} />
        <StatCard label="Leads" value={fmtNumber(d.counts.leads)} icon={HardDrive} />
        <StatCard label="Propostas" value={fmtNumber(d.counts.proposals)} icon={HardDrive} />
        <StatCard label="Espaço usado" value={d.usageMb != null ? `${d.usageMb.toFixed(1)} MB` : "—"} icon={HardDrive} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Backup" icon={Download} subtitle="Arquivo .json com toda a sua base: estabelecimentos, CRM, propostas e configurações" />
          <div className="px-5 pb-5 flex flex-wrap gap-2">
            <Button icon={Download} onClick={download}>Baixar backup</Button>
            <Button variant="secondary" icon={Upload} loading={busy} onClick={() => fileRef.current?.click()}>Restaurar backup</Button>
            <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) restore(f); e.target.value = ""; }} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Armazenamento" icon={HardDrive} subtitle={d.persisted ? "Protegido contra limpeza automática do navegador" : "O navegador pode limpar dados de sites pouco usados"} />
          <div className="px-5 pb-5 flex flex-wrap gap-2">
            {!d.persisted && <Button variant="secondary" onClick={persist}>Proteger meus dados</Button>}
            <Button variant="danger" icon={Trash2} onClick={wipe}>Apagar todos os dados</Button>
          </div>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Registro de atividades" icon={Activity} />
          {!d.logs.length ? <EmptyState title="Sem registros" /> : (
            <div className="px-5 pb-5 max-h-[480px] overflow-y-auto divide-y divide-white/[0.04]">
              {d.logs.map((l) => (
                <div key={l.id} className="flex items-start justify-between gap-3 py-2 text-xs">
                  <div className="min-w-0">
                    <Badge className={l.level === "error" ? "border-rose-400/30 text-rose-300 bg-rose-400/10" : l.level === "alert" ? "border-lime-400/30 text-lime-400 bg-lime-400/10" : undefined}>{l.level}</Badge>
                    <span className="ml-2 text-ink-100">{l.action}</span>
                    <div className="text-ink-500 truncate">{JSON.stringify(l.details)}</div>
                  </div>
                  <span className="text-ink-500 whitespace-nowrap">{fmtDateTime(l.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
