-- =============================================================================
-- Migration 0004 : CRM — entreprises, contacts, prospects, historique, tâches
-- =============================================================================

create table public.companies (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(btrim(name)) between 1 and 200),
  siren           text check (siren ~ '^\d{9}$'),
  sector          text,
  address         text,
  postal_code     text check (postal_code ~ '^\d{5}$'),
  city            text,
  website         text,
  website_domain  text generated always as (public.normalize_domain(website)) stored,
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
-- Doublon strict : un SIREN = une entreprise.
create unique index companies_siren_uidx on public.companies (siren) where siren is not null;
-- Doublon probable : même domaine (non bloquant, signalé à la saisie).
create index companies_domain_idx on public.companies (website_domain) where website_domain is not null;
create index companies_name_idx   on public.companies (lower(name));
create trigger companies_updated_at before update on public.companies
  for each row execute function public.set_updated_at();

create table public.contacts (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies (id) on delete cascade,
  first_name        text,
  last_name         text,
  job_title         text,
  email             text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  email_normalized  text generated always as (public.normalize_email(email)) stored,
  phone             text,
  phone_normalized  text generated always as (public.normalize_phone(phone)) stored,
  is_primary        boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (coalesce(first_name, last_name, email, phone) is not null)
);
create index contacts_company_idx on public.contacts (company_id);
create index contacts_email_idx   on public.contacts (email_normalized) where email_normalized is not null;
create index contacts_phone_idx   on public.contacts (phone_normalized) where phone_normalized is not null;
create unique index contacts_one_primary_idx on public.contacts (company_id) where is_primary;
create trigger contacts_updated_at before update on public.contacts
  for each row execute function public.set_updated_at();

create table public.leads (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references public.companies (id) on delete restrict,
  contact_id         uuid references public.contacts (id) on delete set null,
  status             public.lead_status not null default 'a_contacter',
  source             public.lead_source not null default 'prospection',
  owner_id           uuid references public.profiles (id),  -- commercial responsable (null = à attribuer)
  referrer_id        uuid references public.profiles (id),  -- apporteur éventuel
  created_by         uuid references public.profiles (id),
  last_contact_at    timestamptz,
  next_follow_up_at  timestamptz,
  status_changed_at  timestamptz not null default now(),
  lost_reason        text,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (status <> 'perdu' or lost_reason is not null)
);
-- Une seule opportunité OUVERTE par entreprise (évite deux commerciaux sur le même client).
create unique index leads_one_open_per_company_idx
  on public.leads (company_id) where status not in ('gagne', 'perdu');
create index leads_owner_status_idx on public.leads (owner_id, status);
create index leads_referrer_idx     on public.leads (referrer_id) where referrer_id is not null;
create index leads_follow_up_idx    on public.leads (next_follow_up_at) where status not in ('gagne', 'perdu');
create index leads_unassigned_idx   on public.leads (created_at) where owner_id is null;
create trigger leads_updated_at before update on public.leads
  for each row execute function public.set_updated_at();

-- Historique append-only (statuts, responsables, notes, appels…).
-- Aucune politique UPDATE/DELETE ne sera créée sur cette table.
create table public.lead_activities (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.leads (id) on delete cascade,
  actor_id    uuid references public.profiles (id),
  kind        public.activity_kind not null,
  from_value  text,
  to_value    text,
  body        text,
  occurred_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index lead_activities_lead_idx on public.lead_activities (lead_id, occurred_at desc);
create index lead_activities_kpi_idx  on public.lead_activities (kind, to_value, occurred_at);

create table public.tasks (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid references public.leads (id) on delete cascade,
  customer_id   uuid,  -- FK ajoutée en 0005 (table customers)
  type          public.task_type not null,
  title         text not null check (length(btrim(title)) between 1 and 200),
  description   text,
  due_at        timestamptz not null,
  priority      public.task_priority not null default 'normale',
  status        public.task_status not null default 'a_faire',
  assignee_id   uuid not null references public.profiles (id),
  created_by    uuid references public.profiles (id),
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check ((status = 'fait') = (completed_at is not null))
);
-- « Mes relances du jour » et « tâches en retard » = même index.
create index tasks_assignee_due_idx on public.tasks (assignee_id, due_at) where status in ('a_faire', 'en_cours');
create index tasks_lead_idx on public.tasks (lead_id);
create trigger tasks_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();
