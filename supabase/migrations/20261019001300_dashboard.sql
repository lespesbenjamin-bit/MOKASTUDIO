-- =============================================================================
-- Migration 0013 : indicateurs du tableau de bord (administrateur)
--
-- Trois chiffres, trois sources, jamais additionnés :
--   * CA encaissé      = paiements au statut « encaissé », par date d'encaissement
--   * CA signé non encaissé = valeur contractuelle des contrats en cours − déjà encaissé
--   * MRR              = abonnements actifs à la date de fin de période
-- Les charges « estimées » viennent des hypothèses de gestion (app_settings) et
-- sont présentées comme des estimations, pas comme de la comptabilité.
-- =============================================================================

-- MRR et nombre d'abonnements actifs à une date donnée (historique reconstitué)
create or replace function public._mrr_at(p_date date)
returns table (mrr_cents bigint, active_subscriptions integer)
language sql stable security definer set search_path = public
as $$
  select coalesce(sum(s.monthly_amount_cents), 0)::bigint, count(*)::integer
  from public.subscriptions s
  join public.contracts k on k.id = s.contract_id
  where s.started_on <= p_date
    and (s.cancelled_on is null or s.cancelled_on > p_date)
    and k.status <> 'annule';
$$;
revoke execute on function public._mrr_at(date) from public, anon, authenticated;

create or replace function public.dashboard_kpis(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from     timestamptz := p_from::timestamptz;
  v_to       timestamptz := (p_to + 1)::timestamptz;   -- borne exclusive
  v_days     numeric := (p_to - p_from + 1);
  v_months   numeric;
  v_settings public.app_settings%rowtype;
  v_mrr      record;
  v_cash     bigint;
  v_comm_paid bigint;
  v_fixed    bigint;
  v_variable bigint;
  v_expenses bigint;
  v_provision bigint;
  v_won      integer;
  v_lost     integer;
  r          jsonb := '{}'::jsonb;
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Période invalide' using errcode = '22023'; end if;
  v_months := v_days / (365.25 / 12);
  select * into v_settings from public.app_settings where id;

  -- --- Commercial -------------------------------------------------------------
  with transitions as (
    select distinct a.lead_id, a.to_value
    from public.lead_activities a
    where a.kind = 'changement_statut' and a.occurred_at >= v_from and a.occurred_at < v_to
  )
  select r || jsonb_build_object(
    'leads_created',   (select count(*) from public.leads where created_at >= v_from and created_at < v_to),
    'leads_qualified', (select count(distinct lead_id) from transitions
                         where to_value in ('interesse', 'rdv_programme', 'proposition_envoyee', 'negociation', 'gagne')),
    'meetings',        (select count(distinct lead_id) from transitions where to_value = 'rdv_programme'),
    'proposals',       (select count(distinct lead_id) from transitions where to_value = 'proposition_envoyee'),
    'won',             (select count(distinct lead_id) from transitions where to_value = 'gagne'),
    'lost',            (select count(distinct lead_id) from transitions where to_value = 'perdu'),
    'contracts_signed', (select count(*) from public.contracts
                          where signed_at between p_from and p_to and status <> 'annule'))
  into r;
  v_won := (r ->> 'won')::integer;
  v_lost := (r ->> 'lost')::integer;
  r := r || jsonb_build_object('conversion_rate_bps',
         case when v_won + v_lost > 0 then round(v_won * 10000.0 / (v_won + v_lost)) end);

  r := r || jsonb_build_object('sales_by_owner', coalesce((
    select jsonb_agg(x order by x.contracts desc, x.name)
    from (
      select coalesce(p.full_name, 'Non attribué') as name,
             count(*)::integer as contracts,
             sum(k.setup_fee_cents + k.one_shot_price_cents
                 + (k.monthly_price_cents + k.planning_monthly_cents) * greatest(k.commitment_months, 1))::bigint as value_cents
      from public.contracts k
      join public.customers cu on cu.id = k.customer_id
      left join public.profiles p on p.id = cu.owner_id
      where k.signed_at between p_from and p_to and k.status <> 'annule'
      group by p.full_name
    ) x), '[]'::jsonb));

  -- --- Financier -------------------------------------------------------------------
  select coalesce(sum(amount_cents), 0) into v_cash
    from public.payments where status = 'encaisse' and paid_at >= v_from and paid_at < v_to;

  select * into v_mrr from public._mrr_at(p_to);

  select coalesce(sum(amount_cents), 0) into v_comm_paid
    from public.commissions where status = 'payee' and paid_at >= v_from and paid_at < v_to;

  select coalesce(sum(amount_cents), 0) into v_expenses
    from public.expenses e
   where (not e.is_recurring and e.incurred_on between p_from and p_to);

  v_fixed     := round(v_settings.fixed_costs_monthly_cents * v_months);
  v_variable  := round(v_settings.variable_cost_per_sub_cents * v_mrr.active_subscriptions * v_months);
  v_provision := round(v_cash * v_settings.contributions_provision_bps / 10000.0);

  r := r || jsonb_build_object(
    'cash_in_cents', v_cash,
    'signed_unpaid_cents', (
      select coalesce(sum(greatest(
               k.setup_fee_cents + k.one_shot_price_cents
               + (k.monthly_price_cents + k.planning_monthly_cents) * k.commitment_months
               - coalesce((select sum(p.amount_cents) from public.payments p
                           where p.contract_id = k.id and p.status = 'encaisse'), 0), 0)), 0)
      from public.contracts k
      where k.status in ('signe', 'actif') and k.signed_at <= p_to),
    'mrr_cents', v_mrr.mrr_cents,
    'arr_cents', v_mrr.mrr_cents * 12,
    'active_subscriptions', v_mrr.active_subscriptions,
    'new_subscriptions', (select count(*) from public.subscriptions s join public.contracts k on k.id = s.contract_id
                           where k.signed_at between p_from and p_to and k.status <> 'annule'),
    'cancellations', (select count(*) from public.subscriptions where cancelled_on between p_from and p_to),
    'commissions_due_cents', (select coalesce(sum(amount_cents), 0) from public.commissions where status in ('acquise', 'facturee')),
    'commissions_forecast_cents', (select coalesce(sum(amount_cents), 0) from public.commissions where status = 'previsionnelle'),
    'commissions_paid_cents', v_comm_paid,
    'fixed_costs_cents', v_fixed,
    'variable_costs_cents', v_variable,
    'expenses_cents', v_expenses,
    'contributions_provision_cents', v_provision,
    'estimated_cash_cents', v_cash - v_comm_paid - v_fixed - v_variable - v_expenses - v_provision,
    'overdue_cents', (select coalesce(sum(amount_cents), 0) from public.payments
                       where status = 'en_attente' and due_on < least(p_to + 1, current_date)),
    'period_days', v_days);
  return r;
end;
$$;

-- Séries mensuelles pour les graphiques (12 mois se terminant au mois de p_end)
create or replace function public.dashboard_monthly(p_end date default current_date, p_months integer default 12)
returns table (month date, cash_in_cents bigint, mrr_cents bigint, contracts_signed integer, active_subscriptions integer)
language sql
stable
security definer
set search_path = public
as $$
  with months as (
    select (date_trunc('month', p_end) - make_interval(months => g))::date as m
    from generate_series(0, least(greatest(p_months, 1), 36) - 1) g
  )
  select m,
         (select coalesce(sum(p.amount_cents), 0) from public.payments p
           where p.status = 'encaisse' and p.paid_at >= m and p.paid_at < (m + interval '1 month'))::bigint,
         (select mrr_cents from public._mrr_at(least((m + interval '1 month - 1 day')::date, current_date))),
         (select count(*) from public.contracts k
           where k.signed_at >= m and k.signed_at < (m + interval '1 month') and k.status <> 'annule')::integer,
         (select active_subscriptions from public._mrr_at(least((m + interval '1 month - 1 day')::date, current_date)))
  from months
  where public.is_admin()
  order by m;
$$;

-- Écriture des scénarios : admin (politique déjà en place) ; RPC de confort
create or replace function public.save_scenario(p_id uuid, p_assumptions jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs' using errcode = '42501'; end if;
  update public.financial_scenarios set assumptions = assumptions || p_assumptions where id = p_id;
  if not found then raise exception 'Scénario introuvable'; end if;
end;
$$;
