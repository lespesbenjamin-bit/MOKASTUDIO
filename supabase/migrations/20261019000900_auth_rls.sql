-- =============================================================================
-- Migration 0009 : authentification, rôles et politiques Row Level Security
--
-- Principe : un utilisateur n'a AUCUN droit tant qu'il n'a pas un profil
-- ACTIF. Le rôle est lu dans public.profiles (jamais dans le JWT ni dans
-- user_metadata, que l'utilisateur peut modifier lui-même).
--
-- Trois couches :
--   1. Privilèges (GRANT)  : anon n'a rien ; authenticated a des droits SQL,
--                            filtrés ensuite par la RLS.
--   2. Politiques RLS      : quelles LIGNES chaque rôle voit / modifie.
--   3. Triggers garde-fous : quelles COLONNES un non-admin peut modifier,
--                            transitions de statut autorisées.
-- =============================================================================

-- Sécurité : si une base a reçu l'ancienne version de 0007 (avec FORCE),
-- on retire FORCE pour que le propriétaire (triggers d'audit) puisse écrire.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I no force row level security', t);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. Privilèges
-- -----------------------------------------------------------------------------
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Journal d'audit : lecture seule (écrit uniquement par trigger).
revoke insert, update, delete on public.audit_logs from authenticated;
-- Historique prospect : append-only, pour tout le monde.
revoke update, delete on public.lead_activities from authenticated;

-- -----------------------------------------------------------------------------
-- 2. Fonctions d'identité (SECURITY DEFINER : lisent profiles sans boucle RLS)
-- -----------------------------------------------------------------------------
create or replace function public.current_app_role()
returns public.user_role
language sql stable security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and is_active;
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.current_app_role() = 'admin', false);
$$;

create or replace function public.is_commercial()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.current_app_role() = 'commercial', false);
$$;

create or replace function public.owns_lead(p_lead_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_commercial()
     and exists (select 1 from public.leads where id = p_lead_id and owner_id = auth.uid());
$$;

create or replace function public.owns_customer(p_customer_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_commercial()
     and exists (select 1 from public.customers where id = p_customer_id and owner_id = auth.uid());
$$;

create or replace function public.owns_contract(p_contract_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_commercial()
     and exists (
       select 1 from public.contracts k
       join public.customers c on c.id = k.customer_id
       where k.id = p_contract_id and c.owner_id = auth.uid());
$$;

-- Un commercial accède à une entreprise s'il l'a créée, ou s'il est
-- responsable d'un prospect ou d'un client rattaché.
create or replace function public.can_access_company(p_company_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_commercial() and (
       exists (select 1 from public.companies where id = p_company_id and created_by = auth.uid())
    or exists (select 1 from public.leads     where company_id = p_company_id and owner_id = auth.uid())
    or exists (select 1 from public.customers where company_id = p_company_id and owner_id = auth.uid()));
$$;

-- Annuaire de l'équipe (pour afficher les noms, choisir un responsable).
-- Réservé aux admins et commerciaux ; n'expose ni email ni téléphone.
create or replace function public.team_directory()
returns table (id uuid, full_name text, role public.user_role)
language sql stable security definer set search_path = public
as $$
  select p.id, p.full_name, p.role
  from public.profiles p
  where p.is_active
    and p.role in ('admin', 'commercial')
    and public.current_app_role() in ('admin', 'commercial')
  order by p.full_name;
$$;

-- -----------------------------------------------------------------------------
-- 3. Garde-fous de colonnes
--    Un non-admin ne peut modifier QUE les colonnes listées en argument.
--    Les contextes serveur (postgres, service_role) ne sont pas bridés.
-- -----------------------------------------------------------------------------
create or replace function public.guard_non_admin_columns()
returns trigger
language plpgsql
as $$
declare
  allowed text[] := tg_argv || array['updated_at'];
begin
  if current_user not in ('authenticated', 'anon') or public.is_admin() then
    return new;
  end if;
  if (to_jsonb(new) - allowed) is distinct from (to_jsonb(old) - allowed) then
    raise exception 'Modification non autorisée pour votre rôle sur %', tg_table_name
      using errcode = '42501',
            hint = 'Champs modifiables : ' || array_to_string(tg_argv, ', ');
  end if;
  return new;
end;
$$;

create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_non_admin_columns('full_name', 'phone');

create trigger leads_guard before update on public.leads
  for each row execute function public.guard_non_admin_columns(
    'status', 'contact_id', 'last_contact_at', 'next_follow_up_at',
    'status_changed_at', 'lost_reason', 'notes');

create trigger contracts_guard before update on public.contracts
  for each row execute function public.guard_non_admin_columns('site_status', 'site_url',
    'commitment_end_at');  -- colonne générée : non encore calculée dans NEW

-- Un admin ne peut pas se retirer ses propres droits (évite de perdre
-- le dernier accès administrateur).
create or replace function public.profiles_prevent_self_lockout()
returns trigger
language plpgsql
as $$
begin
  if old.id = auth.uid() and old.role = 'admin'
     and (new.role <> 'admin' or not new.is_active) then
    raise exception 'Un administrateur ne peut pas retirer ses propres droits'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger profiles_self_lockout before update on public.profiles
  for each row execute function public.profiles_prevent_self_lockout();

-- Règles de commission versionnées : seule la clôture (valid_to) est permise.
create or replace function public.commission_rules_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Une règle de commission ne se supprime pas : clôturez-la (valid_to)';
  end if;
  if old.valid_to is not null then
    raise exception 'Cette règle est clôturée et ne peut plus être modifiée';
  end if;
  if (to_jsonb(new) - 'valid_to') is distinct from (to_jsonb(old) - 'valid_to') then
    raise exception 'Une règle publiée ne se modifie pas : créez une nouvelle version';
  end if;
  return new;
end;
$$;
create trigger commission_rules_guard before update or delete on public.commission_rules
  for each row execute function public.commission_rules_guard();

-- Commissions : transitions de statut contrôlées, montants figés, pas de
-- double paiement. S'applique à TOUS, admin et serveur compris.
--   prévisionnelle → acquise | annulée
--   acquise        → facturée | payée | annulée
--   facturée       → payée | annulée
--   payée, annulée → définitifs
create or replace function public.commissions_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'previsionnelle' then
      raise exception 'Commission %, statut % : suppression interdite (utilisez l''annulation)', old.id, old.status;
    end if;
    return old;
  end if;

  if old.status in ('payee', 'annulee') then
    raise exception 'Commission % déjà %, statut définitif', old.id, old.status
      using errcode = '23514';
  end if;

  if new.status is distinct from old.status and not (
       (old.status = 'previsionnelle' and new.status in ('acquise', 'annulee'))
    or (old.status = 'acquise'        and new.status in ('facturee', 'payee', 'annulee'))
    or (old.status = 'facturee'       and new.status in ('payee', 'annulee'))
  ) then
    raise exception 'Transition de commission interdite : % → %', old.status, new.status
      using errcode = '23514';
  end if;

  if old.status <> 'previsionnelle' and
     (new.amount_cents, new.beneficiary_id, new.contract_id, new.tranche, new.rule_id)
       is distinct from
     (old.amount_cents, old.beneficiary_id, old.contract_id, old.tranche, old.rule_id) then
    raise exception 'Montant et bénéficiaire figés une fois la commission acquise'
      using errcode = '23514';
  end if;

  return new;
end;
$$;
create trigger commissions_guard before update or delete on public.commissions
  for each row execute function public.commissions_guard();

-- -----------------------------------------------------------------------------
-- 4. Politiques RLS
--    (select fn()) : évalué une fois par requête, pas une fois par ligne.
-- -----------------------------------------------------------------------------

-- PROFILES ---------------------------------------------------------------------
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
create policy profiles_insert on public.profiles for insert to authenticated
  with check ((select public.is_admin()));
create policy profiles_update on public.profiles for update to authenticated
  using      (id = (select auth.uid()) or (select public.is_admin()))
  with check (id = (select auth.uid()) or (select public.is_admin()));
-- Pas de DELETE : on désactive un compte, on ne l'efface pas.

-- PARAMÉTRAGE (admin seul en écriture) ------------------------------------------
create policy app_settings_admin on public.app_settings for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy offers_select on public.offers for select to authenticated
  using ((select public.current_app_role()) is not null);
create policy offers_admin_write on public.offers for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy objectives_select on public.objectives for select to authenticated
  using ((select public.is_admin())
         or ((select public.is_commercial()) and (user_id is null or user_id = (select auth.uid()))));
create policy objectives_admin_write on public.objectives for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Chaque bénéficiaire voit la grille qui le concerne (transparence).
create policy commission_rules_select on public.commission_rules for select to authenticated
  using ((select public.is_admin())
         or beneficiary_role::text = (select public.current_app_role())::text);
create policy commission_rules_admin_insert on public.commission_rules for insert to authenticated
  with check ((select public.is_admin()));
create policy commission_rules_admin_update on public.commission_rules for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- CRM --------------------------------------------------------------------------
create policy companies_select on public.companies for select to authenticated
  using ((select public.is_admin())
         or ((select public.is_commercial()) and created_by = (select auth.uid()))
         or public.can_access_company(id));
create policy companies_insert on public.companies for insert to authenticated
  with check ((select public.is_admin())
              or ((select public.is_commercial()) and created_by = (select auth.uid())));
create policy companies_update on public.companies for update to authenticated
  using ((select public.is_admin()) or public.can_access_company(id))
  with check ((select public.is_admin()) or public.can_access_company(id));
create policy companies_delete on public.companies for delete to authenticated
  using ((select public.is_admin()));

create policy contacts_all on public.contacts for all to authenticated
  using ((select public.is_admin()) or public.can_access_company(company_id))
  with check ((select public.is_admin()) or public.can_access_company(company_id));

create policy leads_select on public.leads for select to authenticated
  using ((select public.is_admin())
         or ((select public.is_commercial()) and owner_id = (select auth.uid())));
create policy leads_insert on public.leads for insert to authenticated
  with check ((select public.is_admin())
              or ((select public.is_commercial())
                  and owner_id   = (select auth.uid())
                  and created_by = (select auth.uid())
                  and referrer_id is null));
create policy leads_update on public.leads for update to authenticated
  using      ((select public.is_admin()) or ((select public.is_commercial()) and owner_id = (select auth.uid())))
  with check ((select public.is_admin()) or ((select public.is_commercial()) and owner_id = (select auth.uid())));
create policy leads_delete on public.leads for delete to authenticated
  using ((select public.is_admin()));

-- Historique : un commercial ajoute des notes / appels / emails / SMS / RDV.
-- Les changements de statut et de responsable sont écrits par le système.
create policy lead_activities_select on public.lead_activities for select to authenticated
  using ((select public.is_admin()) or public.owns_lead(lead_id));
create policy lead_activities_insert on public.lead_activities for insert to authenticated
  with check (actor_id = (select auth.uid())
              and kind in ('note', 'appel', 'email', 'sms', 'rendez_vous')
              and ((select public.is_admin()) or public.owns_lead(lead_id)));

create policy tasks_select on public.tasks for select to authenticated
  using ((select public.is_admin())
         or ((select public.is_commercial()) and assignee_id = (select auth.uid()))
         or public.owns_lead(lead_id)
         or public.owns_customer(customer_id));
create policy tasks_insert on public.tasks for insert to authenticated
  with check ((select public.is_admin())
              or ((select public.is_commercial())
                  and assignee_id = (select auth.uid())
                  and created_by  = (select auth.uid())
                  and (public.owns_lead(lead_id) or public.owns_customer(customer_id))));
create policy tasks_update on public.tasks for update to authenticated
  using ((select public.is_admin())
         or ((select public.is_commercial()) and assignee_id = (select auth.uid()))
         or public.owns_lead(lead_id) or public.owns_customer(customer_id))
  with check ((select public.is_admin())
              or ((select public.is_commercial()) and assignee_id = (select auth.uid()))
              or public.owns_lead(lead_id) or public.owns_customer(customer_id));
create policy tasks_delete on public.tasks for delete to authenticated
  using ((select public.is_admin())
         or ((select public.is_commercial()) and created_by = (select auth.uid())));

-- VENTES -----------------------------------------------------------------------
create policy deals_select on public.deals for select to authenticated
  using ((select public.is_admin()) or public.owns_lead(lead_id));
create policy deals_insert on public.deals for insert to authenticated
  with check ((select public.is_admin())
              or (public.owns_lead(lead_id) and owner_id = (select auth.uid())));
create policy deals_update on public.deals for update to authenticated
  using      ((select public.is_admin()) or public.owns_lead(lead_id))
  with check ((select public.is_admin()) or (public.owns_lead(lead_id) and owner_id = (select auth.uid())));
create policy deals_delete on public.deals for delete to authenticated
  using ((select public.is_admin()));

create policy customers_select on public.customers for select to authenticated
  using ((select public.is_admin())
         or ((select public.is_commercial()) and owner_id = (select auth.uid())));
create policy customers_admin_write on public.customers for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Contrats : un commercial suit la production du site (statut + URL),
-- il ne touche jamais aux prix (garde-fou contracts_guard).
create policy contracts_select on public.contracts for select to authenticated
  using ((select public.is_admin()) or public.owns_customer(customer_id));
create policy contracts_update on public.contracts for update to authenticated
  using      ((select public.is_admin()) or public.owns_customer(customer_id))
  with check ((select public.is_admin()) or public.owns_customer(customer_id));
create policy contracts_admin_insert on public.contracts for insert to authenticated
  with check ((select public.is_admin()));
create policy contracts_admin_delete on public.contracts for delete to authenticated
  using ((select public.is_admin()));

create policy subscriptions_select on public.subscriptions for select to authenticated
  using ((select public.is_admin()) or public.owns_contract(contract_id));
create policy subscriptions_admin_write on public.subscriptions for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy payments_select on public.payments for select to authenticated
  using ((select public.is_admin()) or public.owns_contract(contract_id));
create policy payments_admin_write on public.payments for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- COMMISSIONS ------------------------------------------------------------------
-- Commercial et apporteur : lecture de LEURS commissions uniquement.
create policy commissions_select on public.commissions for select to authenticated
  using ((select public.is_admin())
         or (beneficiary_id = (select auth.uid()) and (select public.current_app_role()) is not null));
create policy commissions_admin_write on public.commissions for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- FINANCE (admin seul) ---------------------------------------------------------
create policy expenses_admin on public.expenses for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy financial_scenarios_admin on public.financial_scenarios for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- AUDIT (admin, lecture) -------------------------------------------------------
create policy audit_logs_admin_select on public.audit_logs for select to authenticated
  using ((select public.is_admin()));

-- -----------------------------------------------------------------------------
-- 5. Premier administrateur
--    À exécuter UNE fois dans le SQL Editor de Supabase, après avoir créé
--    l'utilisateur dans Authentication > Users. Inutilisable depuis l'app.
-- -----------------------------------------------------------------------------
create or replace function public.bootstrap_first_admin(p_email text, p_full_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if exists (select 1 from public.profiles where role = 'admin') then
    raise exception 'Un administrateur existe déjà : créez les autres comptes depuis l''application';
  end if;
  select id into v_id from auth.users where lower(email) = lower(btrim(p_email));
  if v_id is null then
    raise exception 'Aucun utilisateur % : créez-le d''abord dans Authentication > Users', p_email;
  end if;
  insert into public.profiles (id, role, full_name, email, is_active)
  values (v_id, 'admin', btrim(p_full_name), lower(btrim(p_email)), true);
  return v_id;
end;
$$;
revoke execute on function public.bootstrap_first_admin(text, text) from public, anon, authenticated;
