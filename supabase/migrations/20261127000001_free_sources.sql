-- Fonte de dados usada em cada pesquisa (google | osm) — suporte à fonte gratuita OpenStreetMap.
alter table public.searches add column if not exists provider text not null default 'google'
  check (provider in ('google', 'osm'));
