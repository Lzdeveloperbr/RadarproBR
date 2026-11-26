import { useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { useFavorites } from "../hooks/useFavorites";
import { fetchBusinesses } from "../lib/filters";
import { db } from "../lib/db";
import { Card, CardHeader, EmptyState, PageHeader, PageLoader } from "../components/ui";
import { BusinessList } from "../components/BusinessList";

export function FavoritesPage() {
  const { favorites, isLoading } = useFavorites();
  const ids = [...favorites];
  const fav = useQuery({ queryKey: ["businesses", "favorites", ids.join()], enabled: !isLoading, queryFn: () => fetchBusinesses({ ids }) });
  const prio = useQuery({
    queryKey: ["businesses", "priority"],
    queryFn: async () => fetchBusinesses({ ids: (await db.leads.filter((l) => l.is_priority).toArray()).map((d) => d.business_id) }),
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
