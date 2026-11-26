// Fila persistente de pesquisas/análises em lote, processada pelo navegador do usuário com
// pausa, continuação, cancelamento e retentativas com backoff exponencial. O estado fica no banco
// (batch_jobs / batch_job_items), então o progresso sobrevive a recarregamentos.
import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "../lib/supabase";
import { callFunction, ApiError, errorMessage } from "../lib/api";
import { useAuth } from "./useAuth";

export type ItemPayload =
  | { type: "search"; params: Record<string, unknown>; auto_audit: boolean }
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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isPermanent(e: unknown) {
  return e instanceof ApiError && [400, 401, 403, 404, 412, 413, 422].includes(e.status);
}

export function BatchRunnerProvider({ children }: { children: ReactNode }) {
  const { user, orgId } = useAuth();
  const qc = useQueryClient();
  const active = useRef(new Set<string>());

  const refreshCounts = useCallback(async (jobId: string) => {
    const { data } = await supabase.from("batch_job_items").select("status, result, payload").eq("batch_job_id", jobId);
    const items = data ?? [];
    const found = items.filter((i) => (i.payload as any).type === "search" && i.status === "done").reduce((n, i) => n + ((i.result as any)?.found ?? 0), 0);
    const analyzed = items.filter((i) => (i.payload as any).type === "audit" && i.status === "done").length;
    await supabase.from("batch_jobs").update({
      total_items: items.length,
      done_items: items.filter((i) => i.status === "done").length,
      failed_items: items.filter((i) => i.status === "failed").length,
      found_count: found,
      analyzed_count: analyzed,
    }).eq("id", jobId);
    return items;
  }, []);

  const processItem = useCallback(async (jobId: string, item: any) => {
    const p = item.payload as ItemPayload;
    try {
      let result: any;
      if (p.type === "search") {
        result = await callFunction("search-places", { ...p.params, batch_job_id: jobId });
        if (p.auto_audit && result.business_ids?.length) {
          // Analisa apenas os estabelecimentos ainda não analisados
          const ids: string[] = result.business_ids;
          const pending: string[] = [];
          for (let i = 0; i < ids.length; i += 200) {
            const { data } = await supabase.from("businesses").select("id").in("id", ids.slice(i, i + 200)).is("analyzed_at", null);
            pending.push(...(data ?? []).map((d) => d.id));
          }
          if (pending.length) {
            const { data: last } = await supabase.from("batch_job_items").select("seq").eq("batch_job_id", jobId).order("seq", { ascending: false }).limit(1);
            const base = (last?.[0]?.seq ?? 0) + 1;
            await supabase.from("batch_job_items").insert(pending.map((id, i) => ({
              organization_id: orgId, batch_job_id: jobId, seq: base + i,
              payload: { type: "audit", business_id: id, search_id: result.search?.id },
            })));
          }
        }
        result = { found: result.found, new: result.new, search_id: result.search?.id };
        qc.invalidateQueries({ queryKey: ["searches"] });
      } else {
        const r = await callFunction("audit-business", { business_id: p.business_id });
        result = { score: r.opportunity?.score, level: r.opportunity?.level, status: r.status };
        qc.invalidateQueries({ queryKey: ["business", p.business_id] });
      }
      await supabase.from("batch_job_items").update({ status: "done", result, error: null, finished_at: new Date().toISOString() }).eq("id", item.id);
    } catch (e) {
      const attempts = item.attempts + 1;
      const permanent = isPermanent(e);
      const retry = !permanent && attempts < item.max_attempts;
      const wait = e instanceof ApiError && e.status === 429 ? 30_000 : 5000 * 2 ** (attempts - 1);
      await supabase.from("batch_job_items").update({
        status: retry ? "pending" : "failed",
        error: errorMessage(e).slice(0, 500),
        next_attempt_at: retry ? new Date(Date.now() + wait).toISOString() : null,
        finished_at: retry ? null : new Date().toISOString(),
      }).eq("id", item.id);
      if (e instanceof ApiError && e.status === 412) {
        // Integração ausente: pausa a fila e avisa o usuário
        await supabase.from("batch_jobs").update({ status: "paused" }).eq("id", jobId);
        toast.error(errorMessage(e), { duration: 10000 });
      }
    }
  }, [orgId, qc]);

  const processJob = useCallback(async (jobId: string) => {
    if (active.current.has(jobId)) return;
    active.current.add(jobId);
    try {
      // Libera itens presos em "running" (aba fechada durante o processamento)
      await supabase.from("batch_job_items").update({ status: "pending" }).eq("batch_job_id", jobId).eq("status", "running")
        .lt("started_at", new Date(Date.now() - 3 * 60_000).toISOString());
      const inFlight = new Set<Promise<void>>();
      while (true) {
        const { data: job } = await supabase.from("batch_jobs").select("status").eq("id", jobId).single();
        if (!job || job.status !== "running") break;
        const slots = CONCURRENCY - inFlight.size;
        if (slots > 0) {
          const { data: next } = await supabase.from("batch_job_items").select("*").eq("batch_job_id", jobId).eq("status", "pending")
            .or(`next_attempt_at.is.null,next_attempt_at.lte.${new Date().toISOString()}`).order("seq").limit(slots);
          for (const item of next ?? []) {
            // Reserva atômica do item (evita processamento duplicado em várias abas)
            const { data: claimed } = await supabase.from("batch_job_items")
              .update({ status: "running", attempts: item.attempts + 1, started_at: new Date().toISOString() })
              .eq("id", item.id).eq("status", "pending").select("id");
            if (!claimed?.length) continue;
            const pr: Promise<void> = processItem(jobId, item).finally(() => { inFlight.delete(pr); refreshCounts(jobId); });
            inFlight.add(pr);
          }
        }
        if (inFlight.size === 0) {
          const { count: pending } = await supabase.from("batch_job_items").select("id", { count: "exact", head: true }).eq("batch_job_id", jobId).in("status", ["pending", "running"]);
          if (!pending) {
            const items = await refreshCounts(jobId);
            const failed = items.filter((i) => i.status === "failed").length;
            await supabase.from("batch_jobs").update({ status: items.length && failed === items.length ? "failed" : "completed" }).eq("id", jobId);
            // Atualiza total analisado das pesquisas do lote
            for (const sid of new Set(items.map((i) => (i.result as any)?.search_id).filter(Boolean))) {
              const { data: links } = await supabase.from("search_results").select("business_id, businesses!inner(analyzed_at)").eq("search_id", sid).not("businesses.analyzed_at", "is", null);
              await supabase.from("searches").update({ total_analyzed: links?.length ?? 0 }).eq("id", sid);
            }
            toast.success("Processamento em lote concluído");
            break;
          }
          await sleep(1500);
        } else {
          await Promise.race([...inFlight, sleep(1500)]);
        }
      }
    } catch (e) {
      console.error(e);
      toast.error("Erro na fila de processamento: " + errorMessage(e));
    } finally {
      active.current.delete(jobId);
      qc.invalidateQueries({ queryKey: ["batch"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["businesses"] });
    }
  }, [processItem, refreshCounts, qc]);

  // Retoma filas em andamento deste usuário ao abrir o app
  useEffect(() => {
    if (!user || !orgId) return;
    supabase.from("batch_jobs").select("id").eq("organization_id", orgId).eq("user_id", user.id).eq("status", "running")
      .then(({ data }) => (data ?? []).forEach((j) => processJob(j.id)));
  }, [user, orgId, processJob]);

  const runner: Runner = {
    createJob: async (name, kind, items) => {
      if (!orgId || !user) throw new Error("Sem organização ativa");
      const { data: job, error } = await supabase.from("batch_jobs").insert({ organization_id: orgId, user_id: user.id, name, kind, status: "running", total_items: items.length }).select().single();
      if (error) throw error;
      for (let i = 0; i < items.length; i += 500) {
        const { error: e2 } = await supabase.from("batch_job_items").insert(items.slice(i, i + 500).map((payload, j) => ({ organization_id: orgId, batch_job_id: job.id, seq: i + j, payload })));
        if (e2) throw e2;
      }
      qc.invalidateQueries({ queryKey: ["batch"] });
      processJob(job.id);
      return job.id as string;
    },
    pause: async (jobId) => {
      await supabase.from("batch_jobs").update({ status: "paused" }).eq("id", jobId);
      qc.invalidateQueries({ queryKey: ["batch"] });
      toast("Fila pausada. Os itens em andamento serão concluídos.");
    },
    resume: async (jobId) => {
      await supabase.from("batch_jobs").update({ status: "running" }).eq("id", jobId);
      qc.invalidateQueries({ queryKey: ["batch"] });
      processJob(jobId);
    },
    cancel: async (jobId) => {
      await supabase.from("batch_jobs").update({ status: "cancelled" }).eq("id", jobId);
      await supabase.from("batch_job_items").update({ status: "cancelled" }).eq("batch_job_id", jobId).eq("status", "pending");
      await refreshCounts(jobId);
      qc.invalidateQueries({ queryKey: ["batch"] });
      toast("Fila cancelada");
    },
    retryFailed: async (jobId) => {
      await supabase.from("batch_job_items").update({ status: "pending", attempts: 0, next_attempt_at: null, error: null }).eq("batch_job_id", jobId).eq("status", "failed");
      await supabase.from("batch_jobs").update({ status: "running" }).eq("id", jobId);
      processJob(jobId);
    },
  };
  return <Ctx.Provider value={runner}>{children}</Ctx.Provider>;
}

export function useBatchRunner() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useBatchRunner fora do provider");
  return v;
}
