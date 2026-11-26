import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";

export function useFavorites() {
  const { user, orgId } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["favorites", user?.id, orgId],
    enabled: !!user && !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("favorites").select("business_id").eq("user_id", user!.id).eq("organization_id", orgId!);
      if (error) throw error;
      return new Set((data ?? []).map((f) => f.business_id as string));
    },
  });
  const toggle = useMutation({
    mutationFn: async (businessId: string) => {
      const isFav = q.data?.has(businessId);
      if (isFav) {
        const { error } = await supabase.from("favorites").delete().eq("user_id", user!.id).eq("business_id", businessId);
        if (error) throw error;
        return false;
      }
      const { error } = await supabase.from("favorites").insert({ user_id: user!.id, business_id: businessId, organization_id: orgId! });
      if (error) throw error;
      return true;
    },
    onSuccess: (added) => {
      toast.success(added ? "Adicionado aos favoritos" : "Removido dos favoritos");
      qc.invalidateQueries({ queryKey: ["favorites"] });
    },
    onError: (e: any) => toast.error("Falha ao atualizar favoritos: " + e.message),
  });
  return { favorites: q.data ?? new Set<string>(), toggle: toggle.mutate, isLoading: q.isLoading };
}
