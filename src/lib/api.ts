import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase";

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Chama uma Edge Function com o JWT do usuário e converte erros em mensagens claras. */
export async function callFunction<T = any>(name: string, body?: unknown, opts: { method?: "GET" | "POST"; query?: Record<string, string> } = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new ApiError("Sessão expirada. Entre novamente.", 401);
  const base = (import.meta.env.VITE_FUNCTIONS_URL as string | undefined) ?? `${SUPABASE_URL}/functions/v1`;
  const url = new URL(`${base}/${name}`);
  Object.entries(opts.query ?? {}).forEach(([k, v]) => url.searchParams.set(k, v));
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: SUPABASE_ANON_KEY ?? "",
        "Content-Type": "application/json",
      },
      body: opts.method === "GET" ? undefined : JSON.stringify(body ?? {}),
    });
  } catch {
    throw new ApiError(`Não foi possível conectar à função "${name}". Verifique se as Edge Functions foram publicadas (supabase functions deploy).`, 0, "network");
  }
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* resposta não-JSON */ }
  if (!res.ok) {
    if (res.status === 404 && !data?.error) throw new ApiError(`Edge Function "${name}" não encontrada. Publique com: supabase functions deploy ${name}`, 404, "not_deployed");
    throw new ApiError(data?.error ?? `Erro ${res.status} na função ${name}`, res.status, data?.code);
  }
  return data as T;
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e && typeof e === "object" && "message" in e) return String((e as any).message);
  return "Erro inesperado";
}
