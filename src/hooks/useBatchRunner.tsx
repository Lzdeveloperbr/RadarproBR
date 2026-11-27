// Fila persistente de pesquisas/análises em lote, processada no navegador, com pausa, continuação,
// cancelamento e retentativas com espera crescente. O estado fica no IndexedDB: sobrevive a recarregamentos.
import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db, uid, nowIso } from "../lib/db";
import { searchPlaces, auditBusiness, type SearchParams } from "../lib/services";
import type { BatchItem } from "../lib/types";

export type ItemPayload =
  | { type: "search"; params: SearchParams; auto_audit: boolean }
  | { type: "audit"; business_id: string; search_id?: string };

interface Runner {
  createJob: (name: string, kind: "search" | "audit", items: ItemPayload[]) => Promise<string>;
  pause: (jobId: string) => Promise<void>;
  resume: (jobId: string) => Promise<void>;
  cancel: (jobId: string) => Promise<void>;
  retryFailed: (jobId: string) => Promise<void>;
}

const Ctx = createContext<Runner | null>(null);
const CONCURRENCY = 3;
// O servidor público do OpenStreetMap atende poucas consultas por pessoa: pesquisas rodam uma de cada vez
// (análises digitais não usam o OpenStreetMap e podem rodar em paralelo).
const SEARCH_CONCURRENCY = 1;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const isPermanent = (e: unknown) => /Selecione|Informe|não encontrad|inválid/i.test(errMsg(e));

export function BatchRunnerProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const active = useRef(new Set<string>());

  const refreshCounts = useCallback(async (jobId: string) => {
    const items = await db.batch_items.where("batch_job_id").equals(jobId).toArray();
    await db.batch_jobs.update(jobId, {
      total_items: items.length,
      done_items: items.filter((i) => i.status === "done").length,
      failed_items: items.filter((i) => i.status === "failed").length,
      found_count: items.filter((i) => i.payload.type === "search" && i.status === "done").reduce((n, i) => n + (i.result?.found ?? 0), 0),
      analyzed_count: items.filter((i) => i.payload.type === "audit" && i.status === "done").length,
      updated_at: nowIso(),
    });
    qc.invalidateQueries({ queryKey: ["batch"] });
    return items;
  }, [qc]);

  const processItem = useCallback(async (jobId: string, item: BatchItem) => {
    const p = item.payload as ItemPayload;
    try {
      let result: any;
      if (p.type === "search") {
        const r = await searchPlaces({ ...p.params, batch_job_id: jobId });
        if (p.auto_audit && r.business_ids.length) {
          const pending = (await db.businesses.bulkGet(r.business_ids)).filter((b) => b && !b.analyzed_at).map((b) => b!.id);
          const last = await db.batch_items.where("batch_job_id").equals(jobId).toArray();
          const base = Math.max(0, ...last.map((x) => x.seq)) + 1;
          await db.batch_items.bulkAdd(pending.map((id, i) => ({ id: uid(), batch_job_id: jobId, seq: base + i, payload: { type: "audit", business_id: id, search_id: r.search.id },
            status: "pending" as const, attempts: 0, max_attempts: 3, next_attempt_at: null, result: null, error: null, started_at: null, finished_at: null })));
        }
        result = { found: r.found, new: r.new, search_id: r.search.id };
        qc.invalidateQueries({ queryKey: ["searches"] });
      } else {
        const r = await auditBusiness(p.business_id);
        const b = await db.businesses.get(p.business_id);
        result = { score: r.opportunity.score, level: r.opportunity.level, status: r.status, name: b?.name };
      }
      await db.batch_items.update(item.id, { status: "done", result, error: null, finished_at: nowIso() });
    } catch (e) {
      const attempts = item.attempts + 1;
      const retry = !isPermanent(e) && attempts < Math.max(item.max_attempts, item.payload.type === "search" ? 5 : 3);
      const wait = /429|limitou|ocupados/.test(errMsg(e)) ? 30_000 * attempts : 10_000 * 2 ** (attempts - 1);
      await db.batch_items.update(item.id, {
        status: retry ? "pending" : "failed", attempts, error: errMsg(e).slice(0, 500),
        next_attempt_at: retry ? new Date(Date.now() + wait).toISOString() : null, finished_at: retry ? null : nowIso(),
      });
    }
  }, [qc]);

  const processJob = useCallback(async (jobId: string) => {
    if (active.current.has(jobId)) return;
    active.current.add(jobId);
    try {
      await db.batch_items.where("[batch_job_id+status]").equals([jobId, "running"]).modify({ status: "pending" });
      const inFlight = new Set<Promise<void>>();
      while (true) {
        const job = await db.batch_jobs.get(jobId);
        if (!job || job.status !== "running") break;
        const slots = CONCURRENCY - inFlight.size;
        if (slots > 0) {
          const now = nowIso();
          const runningSearches = (await db.batch_items.where("[batch_job_id+status]").equals([jobId, "running"]).toArray()).filter((i) => i.payload.type === "search").length;
          let searchSlots = SEARCH_CONCURRENCY - runningSearches;
          const next = (await db.batch_items.where("[batch_job_id+status]").equals([jobId, "pending"]).toArray())
            .filter((i) => !i.next_attempt_at || i.next_attempt_at <= now).sort((a, b) => a.seq - b.seq)
            .filter((i) => i.payload.type !== "search" || searchSlots-- > 0).slice(0, slots);
          for (const item of next) {
            await db.batch_items.update(item.id, { status: "running", started_at: nowIso() });
            const pr: Promise<void> = processItem(jobId, item).finally(() => { inFlight.delete(pr); refreshCounts(jobId); });
            inFlight.add(pr);
          }
        }
        if (inFlight.size === 0) {
          const pending = await db.batch_items.where("batch_job_id").equals(jobId).filter((i) => i.status === "pending" || i.status === "running").count();
          if (!pending) {
            const items = await refreshCounts(jobId);
            const failed = items.filter((i) => i.status === "failed").length;
            await db.batch_jobs.update(jobId, { status: items.length && failed === items.length ? "failed" : "completed", updated_at: nowIso() });
            for (const sid of new Set(items.map((i) => i.result?.search_id).filter(Boolean))) {
              const ids = (await db.search_results.where("search_id").equals(sid).toArray()).map((r) => r.business_id);
              const analyzed = (await db.businesses.bulkGet(ids)).filter((b) => b?.analyzed_at).length;
              await db.searches.update(sid, { total_analyzed: analyzed });
            }
            toast.success(failed ? `Processamento concluído com ${failed} falha(s)` : "Processamento concluído");
            break;
          }
          await sleep(1500);
        } else {
          await Promise.race([...inFlight, sleep(1500)]);
        }
      }
    } catch (e) {
      toast.error("Erro na fila de processamento: " + errMsg(e));
    } finally {
      active.current.delete(jobId);
      ["batch", "dashboard", "businesses", "searches", "leads"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    }
  }, [processItem, refreshCounts, qc]);

  useEffect(() => {
    db.batch_jobs.where("status").equals("running").toArray().then((jobs) => jobs.forEach((j) => processJob(j.id)));
  }, [processJob]);

  const runner: Runner = {
    createJob: async (name, kind, items) => {
      const id = uid();
      await db.batch_jobs.add({ id, name, kind, status: "running", total_items: items.length, done_items: 0, failed_items: 0, found_count: 0, analyzed_count: 0, created_at: nowIso(), updated_at: nowIso() });
      await db.batch_items.bulkAdd(items.map((payload, i) => ({ id: uid(), batch_job_id: id, seq: i, payload, status: "pending" as const, attempts: 0, max_attempts: 3,
        next_attempt_at: null, result: null, error: null, started_at: null, finished_at: null })));
      qc.invalidateQueries({ queryKey: ["batch"] });
      processJob(id);
      return id;
    },
    pause: async (id) => { await db.batch_jobs.update(id, { status: "paused" }); qc.invalidateQueries({ queryKey: ["batch"] }); toast("Fila pausada. Os itens em andamento serão concluídos."); },
    resume: async (id) => { await db.batch_jobs.update(id, { status: "running" }); qc.invalidateQueries({ queryKey: ["batch"] }); processJob(id); },
    cancel: async (id) => {
      await db.batch_jobs.update(id, { status: "cancelled" });
      await db.batch_items.where("[batch_job_id+status]").equals([id, "pending"]).modify({ status: "cancelled" });
      await refreshCounts(id);
      toast("Fila cancelada");
    },
    retryFailed: async (id) => {
      await db.batch_items.where("[batch_job_id+status]").equals([id, "failed"]).modify({ status: "pending", attempts: 0, next_attempt_at: null, error: null });
      await db.batch_jobs.update(id, { status: "running" });
      processJob(id);
    },
  };
  return <Ctx.Provider value={runner}>{children}</Ctx.Provider>;
}

export function useBatchRunner() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useBatchRunner fora do provider");
  return v;
}
