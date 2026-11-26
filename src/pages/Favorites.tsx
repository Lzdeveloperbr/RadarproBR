import { useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useFavorites } from "../hooks/useFavorites";
import { fetchBusinesses } from "../lib/filters";
import { supabase } from "../lib/supabase";
import { Card, CardHeader, EmptyState, PageHeader, PageLoader } from "../components/ui";
import { BusinessList } from "../components/BusinessList";

export function FavoritesPage() {
  const { orgId } = useAuth();
  const { favorites, isLoading } = useFavorites();
  const ids = [...favorites];
  const fav = useQuery({ queryKey: ["businesses", "favorites", orgId, ids.join()], enabled: !!orgId && !isLoading, queryFn: () => fetchBusinesses(orgId!, { ids }) });
  const prio = useQuery({
    queryKey: ["businesses", "priority", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase.from("leads").select("business_id").eq("organization_id", orgId!).eq("is_priority", true);
      return fetchBusinesses(orgId!, { ids: (data ?? []).map((d) => d.business_id) });
    },
  });
  return (
    <>
      <PageHeader title="Favoritos" subtitle="Estabelecimentos salvos e lista de empresas prioritárias" icon={Star} />
      <Card className="overflow-hidden mb-4">
        <CardHeader title={`Favoritos (${ids.length})`} icon={Star} />
        {fav.isLoading ? <PageLoader /> : !(fav.data ?? []).length ? <EmptyState icon={Star} title="Nenhum favorito" description="Use o ícone de coração nas listas ou na ficha do estabelecimento." /> : <BusinessList items={fav.data!} />}
      </Card>
      <Card className="overflow-hidden">
        <CardHeader title={`Empresas prioritárias (${prio.data?.length ?? 0})`} icon={Star} subtitle="Marcadas como prioritárias no CRM" />
        {prio.isLoading ? <PageLoader /> : !(prio.data ?? []).length ? <EmptyState title="Nenhuma empresa prioritária" /> : <BusinessList items={prio.data!} />}
      </Card>
    </>
  );
}
