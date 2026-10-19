-- =============================================================================
-- Migration 0006 : règles de commission, commissions, dépenses, scénarios
-- =============================================================================

-- Règles VERSIONNÉES : on ne modifie jamais une règle, on en publie une nouvelle
-- (valid_to de l'ancienne renseigné). Une seule règle courante par couple
-- (bénéficiaire, offre).
create table public.commission_rules (
  id                     uuid primary key default gen_random_uuid(),
  beneficiary_role       public.beneficiary_role not null,
  offer_code             public.offer_code not null,
  amount_cents           bigint  not null check (amount_cents >= 0),
  tranche1_bps           integer not null check (tranche1_bps between 0 and 10000),
  tranche2_bps           integer not null default 0 check (tranche2_bps between 0 and 10000),
  tranche2_after_payments integer check (tranche2_after_payments between 1 and 36),
  valid_from             timestamptz not null default now(),
  valid_to               timestamptz,
  created_by             uuid references public.profiles (id),
  created_at             timestamptz not null default now(),
  check (tranche1_bps + tranche2_bps = 10000),
  check ((tranche2_bps = 0) = (tranche2_after_payments is null)),
  check (valid_to is null or valid_to > valid_from)
);
create unique index commission_rules_current_idx
  on public.commission_rules (beneficiary_role, offer_code) where valid_to is null;

-- Une ligne = une tranche due à un bénéficiaire pour un contrat.
-- Le montant est COPIÉ depuis la règle : changer la règle ne recalcule rien.
create table public.commissions (
  id                  uuid primary key default gen_random_uuid(),
  contract_id         uuid not null references public.contracts (id) on delete restrict,
  rule_id             uuid not null references public.commission_rules (id) on delete restrict,
  beneficiary_id      uuid not null references public.profiles (id) on delete restrict,
  beneficiary_role    public.beneficiary_role not null,
  offer_code          public.offer_code not null,
  tranche             smallint not null check (tranche in (1, 2)),
  amount_cents        bigint not null check (amount_cents >= 0),
  trigger_kind        public.commission_trigger not null,
  required_payments   integer check (required_payments between 1 and 36),
  status              public.commission_status not null default 'previsionnelle',
  acquired_at         timestamptz,
  trigger_payment_id  uuid references public.payments (id),
  invoiced_at         timestamptz,
  invoice_ref         text,
  paid_at             timestamptz,
  payout_ref          text,
  cancelled_at        timestamptz,
  cancel_reason       text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check ((trigger_kind = 'n_mensualites') = (required_payments is not null)),
  check (status not in ('acquise', 'facturee', 'payee') or acquired_at is not null),
  check (status <> 'facturee' or invoiced_at is not null),
  check (status <> 'payee'    or (paid_at is not null and payout_ref is not null)),
  check (status <> 'annulee'  or (cancelled_at is not null and cancel_reason is not null))
);
-- Impossible de générer deux fois la même tranche → pas de double commission.
create unique index commissions_unique_tranche_idx
  on public.commissions (contract_id, beneficiary_id, offer_code, tranche);
create index commissions_beneficiary_idx on public.commissions (beneficiary_id, status);
create index commissions_status_idx      on public.commissions (status, acquired_at);
create trigger commissions_updated_at before update on public.commissions
  for each row execute function public.set_updated_at();

create table public.expenses (
  id            uuid primary key default gen_random_uuid(),
  label         text not null check (length(btrim(label)) between 1 and 200),
  category      public.expense_category not null,
  amount_cents  bigint not null check (amount_cents > 0),
  incurred_on   date not null,
  is_recurring  boolean not null default false,   -- récurrence mensuelle
  ends_on       date,
  notes         text,
  created_by    uuid references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (ends_on is null or (is_recurring and ends_on >= incurred_on))
);
create index expenses_date_idx on public.expenses (incurred_on);
create trigger expenses_updated_at before update on public.expenses
  for each row execute function public.set_updated_at();

-- Scénarios prévisionnels : ce sont des HYPOTHÈSES, jamais des données réelles.
create table public.financial_scenarios (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  kind          public.scenario_kind not null,
  start_month   date not null check (extract(day from start_month) = 1),
  horizon_years integer not null default 3 check (horizon_years between 1 and 5),
  assumptions   jsonb not null,
  is_reference  boolean not null default false,
  created_by    uuid references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (jsonb_typeof(assumptions) = 'object'),
  check (assumptions ?& array[
    'new_subscriptions_per_month', 'direct_sales_per_month', 'renewal_rate_bps',
    'subscription_price_cents', 'setup_fee_cents', 'direct_sale_price_cents',
    'planning_attach_rate_bps', 'planning_price_cents',
    'variable_cost_per_sub_cents', 'fixed_costs_monthly_cents',
    'salary_costs_monthly_cents', 'contributions_provision_bps'
  ])
);
create unique index financial_scenarios_one_reference_per_kind
  on public.financial_scenarios (kind) where is_reference;
create trigger financial_scenarios_updated_at before update on public.financial_scenarios
  for each row execute function public.set_updated_at();
