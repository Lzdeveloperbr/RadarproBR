import { useQuery, useQueryClient } from "@tanstack/react-query";
import { db, getSettings, DEFAULT_SETTINGS } from "../lib/db";
import type { UserSettings } from "../lib/types";

/** Configurações do usuário (salvas no navegador). */
export function useSettings() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["settings"], queryFn: getSettings, staleTime: Infinity });
  return {
    settings: q.data ?? DEFAULT_SETTINGS,
    loading: q.isLoading,
    save: async (patch: Partial<UserSettings>) => {
      await db.settings.put({ ...(q.data ?? DEFAULT_SETTINGS), ...patch, id: "me" });
      await qc.invalidateQueries({ queryKey: ["settings"] });
    },
  };
}
