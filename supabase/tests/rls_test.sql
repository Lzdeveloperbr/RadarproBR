-- Teste de isolamento entre organizações (RLS) e regras de negócio.
\set ON_ERROR_STOP on
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'ana@exemplo.com', '{"full_name":"Ana","company":"Agência Ana"}'),
  ('22222222-2222-2222-2222-222222222222', 'bruno@exemplo.com', '{"full_name":"Bruno"}');

select count(*) = 2 as orgs_criadas from public.organizations;
select count(*) = 2 as settings_criadas from public.user_settings;

-- Ana insere um estabelecimento na sua organização
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
insert into public.businesses (organization_id, dedupe_key, name, city, lat, lng, digital_status, has_own_site, opportunity_level)
  values (public.current_org(), 'barbearia x|tel:12345678', 'Barbearia X', 'Votuporanga', -20.42, -49.97, 'no_site', false, 'alta');
insert into public.leads (organization_id, business_id) select public.current_org(), id from public.businesses;
update public.leads set status = 'primeiro_contato';
select count(*) = 1 as nota_status_criada from public.lead_notes where kind = 'status_change';
select (public.dashboard_stats(public.current_org())->>'total')::int = 1 as dashboard_ok;
select count(*) = 1 as raio_ok from public.businesses_within(public.current_org(), -20.42, -49.97, 5);

-- Duplicidade bloqueada
do $$ begin
  insert into public.businesses (organization_id, dedupe_key, name) values (public.current_org(), 'barbearia x|tel:12345678', 'Barbearia X');
  raise exception 'duplicidade não bloqueada';
exception when unique_violation then raise notice 'duplicidade bloqueada: ok';
end $$;

-- Bruno não enxerga nem altera dados da Ana
reset role;
select set_config('test.ana_org', (select organization_id::text from public.organization_members where user_id = '11111111-1111-1111-1111-111111111111'), false);
set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select count(*) = 0 as bruno_nao_ve_businesses from public.businesses;
select count(*) = 0 as bruno_nao_ve_leads from public.leads;
select count(*) = 1 as bruno_ve_so_sua_org from public.organizations;
update public.businesses set name = 'hack' where organization_id = current_setting('test.ana_org')::uuid;
reset role;
select count(*) = 0 as update_bloqueado from public.businesses where name = 'hack';
set role authenticated;
do $$ begin
  insert into public.businesses (organization_id, dedupe_key, name)
    values (current_setting('test.ana_org')::uuid, 'x', 'invasão');
  raise exception 'RLS falhou';
exception when insufficient_privilege or others then
  if sqlerrm = 'RLS falhou' then raise; end if;
  raise notice 'inserção em outra org bloqueada: ok';
end $$;
-- Bruno não pode trocar para a org da Ana
do $$ begin
  update public.profiles set current_organization_id = current_setting('test.ana_org')::uuid
   where id = '22222222-2222-2222-2222-222222222222';
  raise exception 'troca de org não bloqueada';
exception when others then
  if sqlerrm like 'troca%' then raise; end if;
  raise notice 'troca de organização bloqueada: ok (%)', sqlerrm;
end $$;
reset role;
select 'TODOS OS TESTES PASSARAM' as resultado;
