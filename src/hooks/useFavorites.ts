import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db, nowIso } from "../lib/db";

export function useFavorites() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["favorites"], queryFn: async () => new Set((await db.favorites.toArray()).map((f) => f.business_id)) });
  const toggle = useMutation({
    mutationFn: async (businessId: string) => {
      if (await db.favorites.get(businessId)) { await db.favorites.delete(businessId); return false; }
      await db.favorites.put({ business_id: businessId, created_at: nowIso() });
      return true;
    },
    onSuccess: (added) => {
      toast.success(added ? "Adicionado aos favoritos" : "Removido dos favoritos");
      qc.invalidateQueries({ queryKey: ["favorites"] });
      qc.invalidateQueries({ queryKey: ["businesses"] });
    },
    onError: (e: any) => toast.error("Falha ao atualizar favoritos: " + e.message),
  });
  return { favorites: q.data ?? new Set<string>(), toggle: toggle.mutate, isLoading: q.isLoading };
}
