-- =====================================================================
-- RADAR LOCAL PRO — esquema principal
-- Multi-tenant por organização, com Row Level Security em todas as tabelas.
-- =====================================================================

create extension if not exists "pgcrypto";
create extension if not exists "unaccent";

-- ---------------------------------------------------------------------
-- Tipos enumerados
-- ---------------------------------------------------------------------
create type public.org_role as enum ('owner', 'admin', 'member');

create type public.search_status as enum ('queued', 'running', 'completed', 'failed', 'cancelled');

-- Status de presença digital (cores do mapa):
--  has_site        verde    site próprio online e analisado
--  no_site         vermelho site próprio NÃO identificado após investigação completa
--  site_issues     amarelo  site com problemas (fora do ar, sem HTTPS, etc.)
--  site_pending    azul     site identificado, análise incompleta
--  unknown         cinza    dados insuficientes / ainda não investigado
create type public.digital_status as enum ('has_site', 'no_site', 'site_issues', 'site_pending', 'unknown');

create type public.opportunity_level as enum ('alta', 'media', 'baixa');

create type public.website_kind as enum ('own_site', 'social', 'directory', 'marketplace', 'unknown');

create type public.lead_status as enum (
  'novo', 'nao_analisado', 'analisado', 'oportunidade', 'primeiro_contato',
  'aguardando', 'proposta_enviada', 'negociacao', 'fechado', 'perdido'
);

create type public.contact_type as enum (
  'phone', 'whatsapp', 'email', 'instagram', 'facebook', 'tiktok', 'youtube', 'linkedin', 'twitter', 'other'
);

create type public.job_status as enum ('pending', 'running', 'paused', 'completed', 'failed', 'cancelled');
create type public.job_item_status as enum ('pending', 'running', 'done', 'failed', 'cancelled');

-- ---------------------------------------------------------------------
-- Organizações e perfis
-- ---------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  plan text not null default 'pro',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.org_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members(user_id);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text check (full_name is null or char_length(full_name) <= 120),
  phone text check (phone is null or char_length(phone) <= 30),
  company text check (company is null or char_length(company) <= 120),
  avatar_url text,
  current_organization_id uuid references public.organizations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  seller_name text,
  seller_email text,
  seller_phone text,
  seller_whatsapp text,
  seller_company text,
  seller_website text,
  default_country text not null default 'Brasil',
  default_state text,
  default_city text,
  default_radius_km integer not null default 10 check (default_radius_km between 1 and 100),
  default_max_results integer not null default 60 check (default_max_results between 1 and 300),
  auto_audit boolean not null default true,
  use_web_search boolean not null default true,
  proposal_validity_days integer not null default 15,
  proposal_footer text,
  alert_min_score integer not null default 70 check (alert_min_score between 0 and 100),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Funções auxiliares de permissão (SECURITY DEFINER evita recursão de RLS)
-- ---------------------------------------------------------------------
create or replace function public.is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_org_admin(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org and m.user_id = auth.uid() and m.role in ('owner', 'admin')
  );
$$;

create or replace function public.current_org()
returns uuid language sql stable security definer set search_path = public as $$
  select p.current_organization_id from public.profiles p where p.id = auth.uid();
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Pesquisas
-- ---------------------------------------------------------------------
create table public.searches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  country text not null default 'Brasil',
  state text,
  city text not null check (char_length(city) between 1 and 120),
  neighborhood text,
  categories text[] not null default '{}',
  custom_category text,
  radius_km numeric(6,2) not null default 10 check (radius_km > 0 and radius_km <= 100),
  max_results integer not null default 60 check (max_results between 1 and 300),
  digital_filter text not null default 'all',
  center_lat double precision,
  center_lng double precision,
  status public.search_status not null default 'queued',
  total_found integer not null default 0,
  total_new integer not null default 0,
  total_analyzed integer not null default 0,
  api_calls integer not null default 0,
  error text,
  batch_job_id uuid,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index searches_org_created_idx on public.searches(organization_id, created_at desc);

-- ---------------------------------------------------------------------
-- Estabelecimentos
-- ---------------------------------------------------------------------
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  place_id text,                       -- identificador do Google Places
  dedupe_key text not null,            -- nome normalizado + telefone/coordenadas
  name text not null,
  category text,                       -- categoria do RADAR (ex.: Barbearias)
  primary_type text,                   -- tipo principal do Google
  primary_type_label text,
  types text[] not null default '{}',
  formatted_address text,
  street text,
  street_number text,
  neighborhood text,
  city text,
  state text,
  postal_code text,
  country text,
  lat double precision,
  lng double precision,
  phone text,
  international_phone text,
  google_maps_uri text,
  places_website_uri text,             -- site informado pelo Google Places (bruto)
  rating numeric(2,1),
  user_rating_count integer,
  business_status text,
  opening_hours jsonb,
  price_level text,
  source text not null default 'google_places',
  -- Campos desnormalizados a partir da última auditoria (para filtros rápidos)
  digital_status public.digital_status not null default 'unknown',
  primary_website text,
  has_own_site boolean,                -- null = não verificado
  site_online boolean,
  site_https boolean,
  site_has_location boolean,
  site_mobile_ready boolean,
  has_whatsapp boolean,
  has_instagram boolean,
  has_facebook boolean,
  has_booking boolean,
  has_menu boolean,
  opportunity_level public.opportunity_level,
  opportunity_score integer check (opportunity_score is null or opportunity_score between 0 and 100),
  analyzed_at timestamptz,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index businesses_org_place_uidx on public.businesses(organization_id, place_id) where place_id is not null;
create unique index businesses_org_dedupe_uidx on public.businesses(organization_id, dedupe_key);
create index businesses_org_city_idx on public.businesses(organization_id, city);
create index businesses_org_category_idx on public.businesses(organization_id, category);
create index businesses_org_status_idx on public.businesses(organization_id, digital_status);
create index businesses_org_score_idx on public.businesses(organization_id, opportunity_score desc nulls last);
create index businesses_org_geo_idx on public.businesses(organization_id, lat, lng);
create index businesses_website_idx on public.businesses(organization_id, primary_website);
create trigger businesses_touch before update on public.businesses
  for each row execute function public.touch_updated_at();

create table public.search_results (
  search_id uuid not null references public.searches(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category text,
  was_new boolean not null default false,
  distance_km numeric(8,2),
  created_at timestamptz not null default now(),
  primary key (search_id, business_id)
);
create index search_results_business_idx on public.search_results(business_id);

create table public.business_websites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  url text not null,
  final_url text,
  domain text,
  kind public.website_kind not null default 'unknown',
  source text not null default 'google_places',   -- google_places | web_search | website_link | manual
  verified boolean not null default false,        -- correspondência confirmada com o estabelecimento
  verification_note text,
  is_primary boolean not null default false,
  status_code integer,
  is_online boolean,
  https boolean,
  response_ms integer,
  last_checked_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  unique (business_id, url)
);
create index business_websites_domain_idx on public.business_websites(organization_id, domain);

create table public.digital_audits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  website_id uuid references public.business_websites(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  status text not null default 'completed',  -- completed | partial | failed
  website_url text,
  website_kind public.website_kind,
  checks jsonb not null default '{}'::jsonb, -- { chave: { value: bool|null, evidence: text } }
  location jsonb,                             -- endereço/cep/coordenadas extraídos do site
  sources jsonb not null default '[]'::jsonb, -- fontes consultadas
  robots_allowed boolean,
  pages_analyzed integer not null default 0,
  duration_ms integer,
  error text,
  created_at timestamptz not null default now()
);
create index digital_audits_business_idx on public.digital_audits(business_id, created_at desc);

create table public.business_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  type public.contact_type not null,
  value text not null,
  url text,
  source text not null,
  created_at timestamptz not null default now(),
  unique (business_id, type, value)
);

create table public.business_locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  source text not null,                 -- google_places | website
  full_address text,
  street text,
  neighborhood text,
  city text,
  state text,
  postal_code text,
  lat double precision,
  lng double precision,
  maps_link text,
  has_embedded_map boolean,
  has_directions_button boolean,
  created_at timestamptz not null default now(),
  unique (business_id, source)
);

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  business_id uuid not null unique references public.businesses(id) on delete cascade,
  level public.opportunity_level not null,
  score integer not null check (score between 0 and 100),
  reasons jsonb not null default '[]'::jsonb,       -- [{ kind: 'fact'|'estimate', text, weight }]
  suggested_products text[] not null default '{}',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index opportunities_org_level_idx on public.opportunities(organization_id, level, score desc);

-- ---------------------------------------------------------------------
-- CRM
-- ---------------------------------------------------------------------
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete set null,
  status public.lead_status not null default 'novo',
  position double precision not null default 0,
  potential_value numeric(12,2) check (potential_value is null or potential_value >= 0),
  contact_name text,
  next_follow_up date,
  is_priority boolean not null default false,
  lost_reason text,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, business_id)
);
create index leads_org_status_idx on public.leads(organization_id, status, position);
create index leads_followup_idx on public.leads(organization_id, next_follow_up);
create trigger leads_touch before update on public.leads
  for each row execute function public.touch_updated_at();

create table public.lead_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  kind text not null default 'note' check (kind in ('note','call','whatsapp','email','meeting','visit','proposal','status_change')),
  content text not null check (char_length(content) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index lead_notes_lead_idx on public.lead_notes(lead_id, created_at desc);

create table public.lead_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  title text not null check (char_length(title) between 1 and 300),
  due_at timestamptz,
  done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index lead_tasks_org_due_idx on public.lead_tasks(organization_id, done, due_at);

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  template text not null,
  title text not null,
  contact_name text,
  content jsonb not null default '{}'::jsonb,
  total_value numeric(12,2) not null default 0,
  status text not null default 'draft' check (status in ('draft','sent','accepted','rejected')),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index proposals_org_idx on public.proposals(organization_id, created_at desc);
create trigger proposals_touch before update on public.proposals
  for each row execute function public.touch_updated_at();

create table public.generated_prompts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  kind text not null,      -- lovable_site | app | report | pitch | whatsapp | email | approach | proposal_text
  title text,
  content text not null,
  model text,
  created_at timestamptz not null default now()
);
create index generated_prompts_business_idx on public.generated_prompts(business_id, created_at desc);

create table public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, business_id)
);

create table public.saved_filters (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  filters jsonb not null,
  created_at timestamptz not null default now()
);

create table public.business_views (
  id bigserial primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  viewed_at timestamptz not null default now()
);
create index business_views_user_idx on public.business_views(user_id, viewed_at desc);

-- ---------------------------------------------------------------------
-- Pesquisa em lote (fila persistente)
-- ---------------------------------------------------------------------
create table public.batch_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  kind text not null check (kind in ('search','audit')),
  status public.job_status not null default 'pending',
  total_items integer not null default 0,
  done_items integer not null default 0,
  failed_items integer not null default 0,
  found_count integer not null default 0,
  analyzed_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger batch_jobs_touch before update on public.batch_jobs
  for each row execute function public.touch_updated_at();

create table public.batch_job_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  batch_job_id uuid not null references public.batch_jobs(id) on delete cascade,
  seq integer not null default 0,
  payload jsonb not null,
  status public.job_item_status not null default 'pending',
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  next_attempt_at timestamptz,
  result jsonb,
  error text,
  started_at timestamptz,
  finished_at timestamptz
);
create index batch_job_items_job_idx on public.batch_job_items(batch_job_id, status, seq);

alter table public.searches add constraint searches_batch_fk
  foreign key (batch_job_id) references public.batch_jobs(id) on delete set null;

-- ---------------------------------------------------------------------
-- Uso de APIs e logs
-- ---------------------------------------------------------------------
create table public.api_usage (
  id bigserial primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  provider text not null,       -- google_places | google_geocoding | web_search | anthropic | site_fetch
  endpoint text,
  units integer not null default 1,
  success boolean not null default true,
  status_code integer,
  error text,
  created_at timestamptz not null default now()
);
create index api_usage_org_created_idx on public.api_usage(organization_id, provider, created_at desc);
create index api_usage_user_created_idx on public.api_usage(user_id, created_at desc);

create table public.activity_logs (
  id bigserial primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  level text not null default 'info' check (level in ('info','warning','error','alert')),
  action text not null,
  entity_type text,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activity_logs_org_created_idx on public.activity_logs(organization_id, created_at desc);

-- =====================================================================
-- Novo usuário: cria perfil, organização, vínculo e configurações
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_name text := coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(new.email, '@', 1));
  v_company text := nullif(new.raw_user_meta_data->>'company', '');
begin
  insert into public.organizations (name, created_by)
  values (coalesce(v_company, 'Equipe de ' || v_name), new.id)
  returning id into v_org;

  insert into public.organization_members (organization_id, user_id, role) values (v_org, new.id, 'owner');

  insert into public.profiles (id, email, full_name, company, current_organization_id)
  values (new.id, new.email, v_name, v_company, v_org);

  insert into public.user_settings (user_id, seller_name, seller_email, seller_company)
  values (new.id, v_name, new.email, v_company);

  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Ao aceitar convite (usuário criado via admin invite com metadata invited_org)
create or replace function public.handle_invited_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := nullif(new.raw_user_meta_data->>'invited_org', '')::uuid;
begin
  if v_org is not null then
    insert into public.organization_members (organization_id, user_id, role)
    values (v_org, new.id, coalesce(nullif(new.raw_user_meta_data->>'invited_role','')::public.org_role, 'member'))
    on conflict do nothing;
    update public.profiles set current_organization_id = v_org where id = new.id;
  end if;
  return new;
end $$;

create trigger on_auth_user_invited
  after insert on auth.users
  for each row execute function public.handle_invited_user();

-- Garante que o usuário só selecione organizações às quais pertence
create or replace function public.guard_profile_org()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.current_organization_id is not null
     and new.current_organization_id is distinct from old.current_organization_id
     and not exists (select 1 from public.organization_members m
                     where m.organization_id = new.current_organization_id and m.user_id = new.id) then
    raise exception 'Organização inválida para este usuário';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_org();

-- Lead: registra mudanças de status no histórico
create or replace function public.log_lead_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into public.lead_notes (organization_id, lead_id, user_id, kind, content)
    values (new.organization_id, new.id, auth.uid(), 'status_change',
            'Status alterado de ' || old.status::text || ' para ' || new.status::text);
    if new.status = 'fechado' then new.closed_at := now(); end if;
  end if;
  return new;
end $$;

create trigger leads_status_log before update on public.leads
  for each row execute function public.log_lead_status();

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;

create policy org_select on public.organizations for select using (public.is_org_member(id));
create policy org_update on public.organizations for update using (public.is_org_admin(id)) with check (public.is_org_admin(id));

create policy members_select on public.organization_members for select using (public.is_org_member(organization_id));
create policy members_update on public.organization_members for update
  using (public.is_org_admin(organization_id) and role <> 'owner')
  with check (public.is_org_admin(organization_id) and role <> 'owner');
create policy members_delete on public.organization_members for delete
  using ((public.is_org_admin(organization_id) and role <> 'owner') or (user_id = auth.uid() and role <> 'owner'));

create policy profiles_select on public.profiles for select using (
  id = auth.uid() or exists (
    select 1 from public.organization_members a
    join public.organization_members b on a.organization_id = b.organization_id
    where a.user_id = auth.uid() and b.user_id = profiles.id
  )
);
create policy profiles_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy settings_all on public.user_settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Tabelas de dados da organização: acesso total para membros
do $$
declare t text;
begin
  foreach t in array array[
    'searches','businesses','search_results','business_websites','digital_audits','business_contacts',
    'business_locations','opportunities','leads','lead_notes','lead_tasks','proposals','generated_prompts',
    'batch_jobs','batch_job_items'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select using (public.is_org_member(organization_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert with check (public.is_org_member(organization_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete using (public.is_org_member(organization_id))', t || '_delete', t);
  end loop;
end $$;

-- Dados pessoais do usuário dentro da organização
alter table public.favorites enable row level security;
create policy favorites_all on public.favorites for all
  using (user_id = auth.uid() and public.is_org_member(organization_id))
  with check (user_id = auth.uid() and public.is_org_member(organization_id));

alter table public.saved_filters enable row level security;
create policy saved_filters_all on public.saved_filters for all
  using (user_id = auth.uid() and public.is_org_member(organization_id))
  with check (user_id = auth.uid() and public.is_org_member(organization_id));

alter table public.business_views enable row level security;
create policy business_views_all on public.business_views for all
  using (user_id = auth.uid() and public.is_org_member(organization_id))
  with check (user_id = auth.uid() and public.is_org_member(organization_id));

-- Uso de API e logs: membros leem; inserção apenas pelo próprio usuário (Edge Functions usam o JWT do usuário)
alter table public.api_usage enable row level security;
create policy api_usage_select on public.api_usage for select using (public.is_org_member(organization_id));
create policy api_usage_insert on public.api_usage for insert
  with check (public.is_org_member(organization_id) and (user_id is null or user_id = auth.uid()));

alter table public.activity_logs enable row level security;
create policy activity_select on public.activity_logs for select using (public.is_org_member(organization_id));
create policy activity_insert on public.activity_logs for insert
  with check (public.is_org_member(organization_id) and (user_id is null or user_id = auth.uid()));

-- =====================================================================
-- Funções de consulta
-- =====================================================================

-- Indicadores do dashboard (respeita RLS: SECURITY INVOKER)
create or replace function public.dashboard_stats(p_org uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  with b as (select * from public.businesses where organization_id = p_org),
       l as (select * from public.leads where organization_id = p_org)
  select jsonb_build_object(
    'total', (select count(*) from b),
    'with_site', (select count(*) from b where has_own_site is true),
    'without_site', (select count(*) from b where digital_status = 'no_site'),
    'not_verified', (select count(*) from b where has_own_site is null),
    'sites_offline', (select count(*) from b where has_own_site and site_online is false),
    'sites_no_location', (select count(*) from b where has_own_site and site_online and site_has_location is false),
    'with_instagram', (select count(*) from b where has_instagram),
    'with_whatsapp', (select count(*) from b where has_whatsapp),
    'with_booking', (select count(*) from b where has_booking),
    'with_menu', (select count(*) from b where has_menu),
    'opportunities', (select count(*) from b where opportunity_level in ('alta','media')),
    'opp_alta', (select count(*) from b where opportunity_level = 'alta'),
    'opp_media', (select count(*) from b where opportunity_level = 'media'),
    'opp_baixa', (select count(*) from b where opportunity_level = 'baixa'),
    'analyzed', (select count(*) from b where analyzed_at is not null),
    'leads_total', (select count(*) from l),
    'leads_contacted', (select count(*) from l where status in ('primeiro_contato','aguardando','proposta_enviada','negociacao','fechado','perdido')),
    'proposals_sent', (select count(*) from public.proposals where organization_id = p_org and status in ('sent','accepted','rejected')),
    'clients_won', (select count(*) from l where status = 'fechado'),
    'pipeline_value', (select coalesce(sum(potential_value),0) from l where status not in ('fechado','perdido')),
    'won_value', (select coalesce(sum(potential_value),0) from l where status = 'fechado'),
    'status_counts', (select coalesce(jsonb_object_agg(digital_status, c), '{}'::jsonb) from (select digital_status, count(*) c from b group by 1) s),
    'by_category', (select coalesce(jsonb_agg(jsonb_build_object('name', category, 'value', c) order by c desc), '[]'::jsonb)
                    from (select coalesce(category,'Outros') category, count(*) c from b group by 1 order by 2 desc limit 12) s),
    'by_city', (select coalesce(jsonb_agg(jsonb_build_object('name', city, 'value', c) order by c desc), '[]'::jsonb)
                from (select coalesce(city,'—') city, count(*) c from b group by 1 order by 2 desc limit 12) s),
    'lead_funnel', (select coalesce(jsonb_object_agg(status, c), '{}'::jsonb) from (select status, count(*) c from l group by 1) s),
    'searches_timeline', (select coalesce(jsonb_agg(jsonb_build_object('date', d, 'searches', s, 'found', f) order by d), '[]'::jsonb)
                          from (select date_trunc('day', created_at)::date d, count(*) s, sum(total_found) f
                                from public.searches where organization_id = p_org and created_at > now() - interval '30 days'
                                group by 1) t)
  );
$$;

-- Sites compartilhados por vários estabelecimentos (detecção de duplicidade)
create or replace function public.duplicate_websites(p_org uuid)
returns table(domain text, businesses bigint, names text[]) language sql stable security invoker set search_path = public as $$
  select w.domain, count(distinct w.business_id), array_agg(distinct b.name)
  from public.business_websites w join public.businesses b on b.id = w.business_id
  where w.organization_id = p_org and w.kind = 'own_site' and w.domain is not null
  group by w.domain having count(distinct w.business_id) > 1
  order by 2 desc;
$$;

-- Busca por raio (haversine) para filtros geográficos
create or replace function public.businesses_within(p_org uuid, p_lat double precision, p_lng double precision, p_km double precision)
returns setof public.businesses language sql stable security invoker set search_path = public as $$
  select * from public.businesses b
  where b.organization_id = p_org and b.lat is not null and b.lng is not null
    and b.lat between p_lat - p_km / 111.0 and p_lat + p_km / 111.0
    and 6371 * 2 * asin(sqrt(power(sin(radians(b.lat - p_lat) / 2), 2)
        + cos(radians(p_lat)) * cos(radians(b.lat)) * power(sin(radians(b.lng - p_lng) / 2), 2))) <= p_km;
$$;

-- Uso de API em janela (rate limiting nas Edge Functions)
create or replace function public.api_usage_count(p_org uuid, p_provider text, p_seconds integer)
returns integer language sql stable security invoker set search_path = public as $$
  select coalesce(sum(units), 0)::int from public.api_usage
  where organization_id = p_org and provider = p_provider and created_at > now() - make_interval(secs => p_seconds);
$$;

-- Realtime para progresso de pesquisas e filas
alter publication supabase_realtime add table public.searches;
alter publication supabase_realtime add table public.batch_jobs;
alter publication supabase_realtime add table public.batch_job_items;
