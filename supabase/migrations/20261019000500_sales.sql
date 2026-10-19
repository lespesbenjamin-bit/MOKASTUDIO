-- =============================================================================
-- Migration 0005 : opportunités, clients, contrats, abonnements, paiements
-- Règle d'or : chaque contrat FIGE les prix signés. Les montants sont en
-- centimes (bigint). CA encaissé = payments ; CA contractuel = contracts ;
-- MRR = subscriptions actives. Trois sources, jamais mélangées.
-- =============================================================================

create table public.deals (
  id                    uuid primary key default gen_random_uuid(),
  lead_id               uuid not null references public.leads (id) on delete restrict,
  owner_id              uuid references public.profiles (id),
  offer_code            public.offer_code not null check (offer_code <> 'option_planning'),
  with_planning_option  boolean not null default false,
  status                public.deal_status not null default 'ouvert',
  proposal_sent_at      timestamptz,
  closed_at             timestamptz,
  lost_reason           text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check ((status = 'ouvert') = (closed_at is null))
);
create index deals_lead_idx  on public.deals (lead_id);
create index deals_owner_idx on public.deals (owner_id, status);
create trigger deals_updated_at before update on public.deals
  for each row execute function public.set_updated_at();

-- Le client garde le lien vers son prospect d'origine : l'historique est conservé.
create table public.customers (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null unique references public.companies (id) on delete restrict,
  lead_id       uuid not null unique references public.leads (id) on delete restrict,
  owner_id      uuid references public.profiles (id),
  referrer_id   uuid references public.profiles (id),
  converted_at  timestamptz not null default now(),
  converted_by  uuid references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index customers_owner_idx    on public.customers (owner_id);
create index customers_referrer_idx on public.customers (referrer_id) where referrer_id is not null;
create trigger customers_updated_at before update on public.customers
  for each row execute function public.set_updated_at();

alter table public.tasks
  add constraint tasks_customer_fk foreign key (customer_id) references public.customers (id) on delete cascade,
  add constraint tasks_has_target check (lead_id is not null or customer_id is not null);

create table public.contracts (
  id                       uuid primary key default gen_random_uuid(),
  reference                text not null unique,           -- ex. MOKA-2026-0001
  customer_id              uuid not null references public.customers (id) on delete restrict,
  deal_id                  uuid references public.deals (id) on delete set null,
  offer_code               public.offer_code not null check (offer_code <> 'option_planning'),
  status                   public.contract_status not null default 'signe',
  -- Prix figés à la signature (centimes)
  monthly_price_cents      bigint not null default 0 check (monthly_price_cents >= 0),
  setup_fee_cents          bigint not null default 0 check (setup_fee_cents >= 0),
  one_shot_price_cents     bigint not null default 0 check (one_shot_price_cents >= 0),
  with_planning_option     boolean not null default false,
  planning_monthly_cents   bigint not null default 0 check (planning_monthly_cents >= 0),
  offer_snapshot           jsonb  not null default '{}'::jsonb,  -- copie complète du catalogue au jour J
  -- Dates
  signed_at                date not null,
  activated_at             date,
  commitment_months        integer not null default 0 check (commitment_months between 0 and 60),
  commitment_end_at        date generated always as (
                             case when activated_at is not null and commitment_months > 0
                                  then (activated_at + make_interval(months => commitment_months))::date
                             end) stored,
  renewal                  public.renewal_mode not null default 'tacite',
  terminated_at            date,
  termination_reason       text,
  -- Production du site
  site_status              public.site_status not null default 'a_produire',
  site_url                 text,
  created_by               uuid references public.profiles (id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  check (activated_at is null or activated_at >= signed_at),
  check (with_planning_option or planning_monthly_cents = 0),
  check (offer_code <> 'abonnement'    or (monthly_price_cents > 0 and one_shot_price_cents = 0)),
  check (offer_code <> 'vente_directe' or (one_shot_price_cents > 0 and monthly_price_cents = 0)),
  check (site_status <> 'en_ligne' or site_url is not null)
);
create index contracts_customer_idx on public.contracts (customer_id);
create index contracts_signed_idx   on public.contracts (signed_at);
create index contracts_status_idx   on public.contracts (status);
create trigger contracts_updated_at before update on public.contracts
  for each row execute function public.set_updated_at();

-- Partie récurrente d'un contrat (abonnement et/ou option planning).
create table public.subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  contract_id           uuid not null unique references public.contracts (id) on delete restrict,
  status                public.subscription_status not null default 'active',
  monthly_amount_cents  bigint not null check (monthly_amount_cents > 0),  -- base MRR
  started_on            date not null,
  next_due_on           date,
  cancelled_on          date,
  cancel_reason         text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check ((status = 'resiliee') = (cancelled_on is not null))
);
create index subscriptions_active_idx on public.subscriptions (status, started_on);
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

create table public.payments (
  id               uuid primary key default gen_random_uuid(),
  contract_id      uuid not null references public.contracts (id) on delete restrict,
  subscription_id  uuid references public.subscriptions (id) on delete restrict,
  kind             public.payment_kind not null,
  amount_cents     bigint not null check (amount_cents > 0),
  due_on           date not null,
  period_month     date check (period_month is null or extract(day from period_month) = 1),
  status           public.payment_status not null default 'en_attente',
  paid_at          timestamptz,
  method           text,          -- virement, prélèvement, CB, Stripe…
  external_ref     text,          -- id Stripe / référence bancaire
  created_by       uuid references public.profiles (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check ((status in ('encaisse', 'rembourse')) = (paid_at is not null)),
  check (kind <> 'mensualite' or (subscription_id is not null and period_month is not null))
);
-- Une mensualité par mois et par abonnement : pas de double facturation.
create unique index payments_one_per_period_idx
  on public.payments (subscription_id, period_month) where kind = 'mensualite';
create unique index payments_external_ref_idx on public.payments (external_ref) where external_ref is not null;
create index payments_paid_idx     on public.payments (paid_at) where status = 'encaisse';
create index payments_contract_idx on public.payments (contract_id, status);
create trigger payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();
