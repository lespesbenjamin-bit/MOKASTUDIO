-- =============================================================================
-- Migration 0007 : journal d'audit + verrouillage RLS par défaut
-- =============================================================================

create table public.audit_logs (
  id              bigint generated always as identity primary key,
  occurred_at     timestamptz not null default now(),
  actor_id        uuid,                     -- auth.uid() au moment de l'opération
  action          text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  table_name      text not null,
  record_id       uuid,
  changed_fields  text[],
  old_data        jsonb,
  new_data        jsonb
);
create index audit_logs_record_idx on public.audit_logs (table_name, record_id, occurred_at desc);
create index audit_logs_actor_idx  on public.audit_logs (actor_id, occurred_at desc);

-- SECURITY DEFINER : le trigger écrit dans audit_logs même si l'utilisateur
-- n'a aucun droit d'écriture direct sur cette table.
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_changed text[];
begin
  if tg_op = 'UPDATE' then
    select array_agg(key order by key) into v_changed
    from jsonb_each(v_new) n
    where n.value is distinct from v_old -> n.key
      and n.key <> 'updated_at';
    if v_changed is null then return new; end if;   -- rien de significatif
  end if;

  insert into public.audit_logs (actor_id, action, table_name, record_id, changed_fields, old_data, new_data)
  values (
    auth.uid(), tg_op, tg_table_name,
    case when coalesce(v_new ->> 'id', v_old ->> 'id') ~* '^[0-9a-f-]{36}$'
         then coalesce(v_new ->> 'id', v_old ->> 'id')::uuid end,  -- app_settings a un id booléen
    v_changed, v_old, v_new
  );
  return coalesce(new, old);
end;
$$;

-- Tables sensibles auditées
do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'app_settings', 'offers', 'objectives', 'leads', 'deals', 'customers',
    'contracts', 'subscriptions', 'payments', 'commission_rules', 'commissions',
    'expenses', 'financial_scenarios'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I
         for each row execute function public.audit_row_change()',
      t || '_audit', t);
  end loop;
end;
$$;

-- RLS activée partout, SANS politique : tout est refusé aux rôles
-- anon/authenticated tant que l'étape 2 n'a pas posé les politiques.
-- (Pas de FORCE : le propriétaire des tables doit pouvoir écrire via les
--  triggers d'audit et les fonctions SECURITY DEFINER.)
do $$
declare t text;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;
