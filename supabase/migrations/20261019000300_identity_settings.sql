-- =============================================================================
-- Migration 0003 : utilisateurs, paramètres, catalogue d'offres, objectifs
-- =============================================================================

-- Profil applicatif, 1-1 avec auth.users (Supabase Auth).
-- Le rôle n'est JAMAIS lu depuis user_metadata (modifiable par l'utilisateur) :
-- il vit ici et seul un admin peut le changer (RLS, étape 2).
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        public.user_role not null,
  full_name   text not null check (length(btrim(full_name)) between 1 and 120),
  email       text not null,
  phone       text,
  is_active   boolean not null default false,   -- un compte doit être activé par l'admin
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index profiles_role_idx on public.profiles (role) where is_active;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Hypothèses de gestion : une seule ligne (id = true).
create table public.app_settings (
  id                              boolean primary key default true check (id),
  variable_cost_per_sub_cents     bigint  not null default 500   check (variable_cost_per_sub_cents >= 0),
  fixed_costs_monthly_cents       bigint  not null default 10000 check (fixed_costs_monthly_cents >= 0),
  contributions_provision_bps     integer not null default 2500  check (contributions_provision_bps between 0 and 10000),
  creation_hour_cost_cents        bigint  not null default 0     check (creation_hour_cost_cents >= 0),
  stale_lead_days                 integer not null default 14    check (stale_lead_days between 1 and 365),
  updated_by                      uuid references public.profiles (id),
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);
comment on column public.app_settings.contributions_provision_bps is
  'Provision de cotisations en points de base (2500 = 25 %). Estimation de gestion, pas un calcul fiscal.';
create trigger app_settings_updated_at before update on public.app_settings
  for each row execute function public.set_updated_at();

-- Catalogue : tarifs ACTUELS. Les contrats copient les prix à la signature,
-- donc modifier une ligne ici n'affecte jamais un contrat existant.
create table public.offers (
  code                  public.offer_code primary key,
  label                 text    not null,
  description           text,
  monthly_price_cents   bigint  not null default 0 check (monthly_price_cents >= 0),
  setup_fee_cents       bigint  not null default 0 check (setup_fee_cents >= 0),
  one_shot_price_cents  bigint  not null default 0 check (one_shot_price_cents >= 0),
  commitment_months     integer not null default 0 check (commitment_months between 0 and 60),
  is_active             boolean not null default true,
  updated_by            uuid references public.profiles (id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create trigger offers_updated_at before update on public.offers
  for each row execute function public.set_updated_at();

-- Objectifs mensuels (globaux si user_id est null, sinon par commercial).
create table public.objectives (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.profiles (id) on delete cascade,
  period_month date not null check (extract(day from period_month) = 1),
  metric       public.objective_metric not null,
  target       bigint not null check (target >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index objectives_unique_idx
  on public.objectives (coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), period_month, metric);
create trigger objectives_updated_at before update on public.objectives
  for each row execute function public.set_updated_at();
