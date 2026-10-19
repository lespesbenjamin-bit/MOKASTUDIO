-- =============================================================================
-- Migration 0015 : PROJETS CLIENTS (de la signature à la livraison du site)
--
--  client_projects          projet rattaché à un client (et à son contrat)
--  project_questionnaires   réponses du questionnaire (un document JSON par projet)
--  project_files            documents envoyés (stockage privé « project-files »)
--  project_tasks            tâches de production
--  project_events           historique unique : commentaires, statuts, validations
--  project_briefs           versions du brief de développement
--  project_access_tokens    liens client (seule l'empreinte SHA-256 est stockée)
--  notifications            notifications dans le CRM (emails : architecture prête,
--                           rien n'est envoyé tant qu'aucun service n'est branché)
--
-- Sécurité :
--  * l'équipe LIT via la RLS (admin : tout ; commercial : projets de ses clients) ;
--  * toutes les ÉCRITURES passent par des fonctions contrôlées (pas d'écriture
--    directe sur les tables, sauf les tâches de production pour l'admin) ;
--  * le client (sans compte) n'utilise QUE les fonctions portal_* qui vérifient
--    son jeton et ne renvoient que son projet. Aucune table ne lui est ouverte.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Types
-- -----------------------------------------------------------------------------
create type public.project_status as enum (
  'en_attente_infos', 'questionnaire_recu', 'brief_a_valider', 'pret_a_produire',
  'en_creation', 'en_validation_client', 'pret_a_publier', 'livre', 'annule');

create type public.questionnaire_status as enum ('non_commence', 'en_cours', 'recu');

-- -----------------------------------------------------------------------------
-- 2. Paramètres
-- -----------------------------------------------------------------------------
alter table public.app_settings
  add column if not exists project_delivery_days integer not null default 10 check (project_delivery_days between 1 and 120),
  add column if not exists project_link_days     integer not null default 60 check (project_link_days between 1 and 365),
  add column if not exists privacy_policy_url    text check (privacy_policy_url is null or privacy_policy_url ~* '^https?://'),
  add column if not exists contact_email         text check (contact_email is null or contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');

-- -----------------------------------------------------------------------------
-- 3. Tables
-- -----------------------------------------------------------------------------
create table public.client_projects (
  id                  uuid primary key default gen_random_uuid(),
  customer_id         uuid not null references public.customers (id) on delete restrict,
  contract_id         uuid references public.contracts (id) on delete set null,
  title               text not null check (length(btrim(title)) between 1 and 200),
  status              public.project_status not null default 'en_attente_infos',
  assignee_id         uuid references public.profiles (id),        -- responsable production
  target_date         date,                                        -- livraison prévue
  scope_validated_at  timestamptz,
  delivered_at        timestamptz,
  site_url            text check (site_url is null or site_url ~* '^https?://'),
  next_action         text check (next_action is null or length(next_action) <= 300),
  cancel_reason       text,
  status_changed_at   timestamptz not null default now(),
  last_activity_at    timestamptz not null default now(),
  created_by          uuid references public.profiles (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (status <> 'livre'  or (delivered_at is not null and site_url is not null)),
  check (status <> 'annule' or nullif(btrim(cancel_reason), '') is not null)
);
-- Un seul projet actif par contrat
create unique index client_projects_contract_uidx on public.client_projects (contract_id)
  where contract_id is not null and status <> 'annule';
create index client_projects_customer_idx on public.client_projects (customer_id);
create index client_projects_status_idx   on public.client_projects (status, target_date);
create trigger client_projects_updated_at before update on public.client_projects
  for each row execute function public.set_updated_at();

create table public.project_questionnaires (
  project_id      uuid primary key references public.client_projects (id) on delete cascade,
  status          public.questionnaire_status not null default 'non_commence',
  answers         jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  current_step    integer not null default 0 check (current_step between 0 and 5),
  completion_pct  integer not null default 0 check (completion_pct between 0 and 100),
  started_at      timestamptz,
  submitted_at    timestamptz,
  submitted_via   text check (submitted_via in ('client', 'equipe')),
  submitted_by    uuid references public.profiles (id),
  consent_at      timestamptz,
  last_saved_via  text check (last_saved_via in ('client', 'equipe')),
  last_saved_at   timestamptz,
  updated_at      timestamptz not null default now(),
  check ((status = 'recu') = (submitted_at is not null)),
  check (status <> 'recu' or consent_at is not null)
);
create trigger project_questionnaires_updated_at before update on public.project_questionnaires
  for each row execute function public.set_updated_at();

create table public.project_files (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.client_projects (id) on delete restrict,
  category       text not null check (category in (
                   'logo', 'photos_etablissement', 'photos_prestations', 'photos_realisations',
                   'portraits_equipe', 'plaquette_tarifaire', 'carte_prestations', 'autres')),
  storage_path   text not null unique,
  original_name  text not null check (length(original_name) between 1 and 160),
  mime_type      text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes     bigint not null check (size_bytes between 1 and 10485760),
  status         text not null default 'en_attente' check (status in ('en_attente', 'valide')),
  uploaded_via   text not null check (uploaded_via in ('client', 'equipe')),
  uploaded_by    uuid references public.profiles (id),
  created_at     timestamptz not null default now(),
  confirmed_at   timestamptz
);
create index project_files_project_idx on public.project_files (project_id, category);

create table public.project_tasks (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.client_projects (id) on delete cascade,
  title        text not null check (length(btrim(title)) between 1 and 200),
  status       text not null default 'a_faire' check (status in ('a_faire', 'en_cours', 'fait')),
  assignee_id  uuid references public.profiles (id),
  due_on       date,
  position     integer not null default 0,
  done_at      timestamptz,
  created_by   uuid references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check ((status = 'fait') = (done_at is not null))
);
create index project_tasks_project_idx on public.project_tasks (project_id, position);
create trigger project_tasks_updated_at before update on public.project_tasks
  for each row execute function public.set_updated_at();

create table public.project_events (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.client_projects (id) on delete cascade,
  kind         text not null check (kind in (
                 'projet_cree', 'lien_cree', 'lien_revoque', 'questionnaire_commence', 'questionnaire_recu',
                 'documents_ajoutes', 'document_supprime', 'infos_manquantes', 'brief_genere', 'brief_valide',
                 'statut', 'commentaire', 'modification')),
  body         text check (body is null or length(body) <= 4000),
  from_value   text,
  to_value     text,
  actor_id     uuid references public.profiles (id),   -- null = le client (via son lien)
  created_at   timestamptz not null default now()
);
create index project_events_project_idx on public.project_events (project_id, created_at desc);

create table public.project_briefs (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.client_projects (id) on delete cascade,
  version       integer not null check (version > 0),
  content       text not null check (length(content) between 1 and 200000),
  generated_by  uuid references public.profiles (id),
  created_at    timestamptz not null default now(),
  validated_at  timestamptz,
  validated_by  uuid references public.profiles (id),
  unique (project_id, version)
);

create table public.project_access_tokens (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.client_projects (id) on delete cascade,
  token_hash    text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),  -- SHA-256 du jeton
  created_by    uuid references public.profiles (id),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  revoked_at    timestamptz,
  revoked_by    uuid references public.profiles (id),
  last_used_at  timestamptz,
  use_count     integer not null default 0
);
create index project_access_tokens_project_idx on public.project_access_tokens (project_id);

create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  project_id    uuid references public.client_projects (id) on delete cascade,
  kind          text not null,
  title         text not null,
  body          text,
  link          text,
  created_at    timestamptz not null default now(),
  read_at       timestamptz,
  -- Préparé pour l'envoi d'emails : reste « non_envoye » tant qu'aucun service n'est branché.
  email_status  text not null default 'non_envoye' check (email_status in ('non_envoye', 'a_envoyer', 'envoye', 'echec'))
);
create index notifications_user_idx on public.notifications (user_id, read_at, created_at desc);

-- Audit des tables sensibles
create trigger client_projects_audit after insert or update or delete on public.client_projects
  for each row execute function public.audit_row_change();
create trigger project_access_tokens_audit after insert or update or delete on public.project_access_tokens
  for each row execute function public.audit_row_change();
create trigger project_briefs_audit after insert or update or delete on public.project_briefs
  for each row execute function public.audit_row_change();

-- -----------------------------------------------------------------------------
-- 4. Privilèges et RLS : lecture via RLS, écritures via fonctions
-- -----------------------------------------------------------------------------
alter table public.client_projects        enable row level security;
alter table public.project_questionnaires enable row level security;
alter table public.project_files          enable row level security;
alter table public.project_tasks          enable row level security;
alter table public.project_events         enable row level security;
alter table public.project_briefs         enable row level security;
alter table public.project_access_tokens  enable row level security;
alter table public.notifications          enable row level security;

revoke all on public.client_projects, public.project_questionnaires, public.project_files, public.project_tasks,
              public.project_events, public.project_briefs, public.project_access_tokens, public.notifications
  from anon, authenticated;
grant select on public.client_projects, public.project_questionnaires, public.project_files, public.project_tasks,
                public.project_events, public.project_briefs, public.notifications
  to authenticated;
-- Liens : l'empreinte n'est jamais lisible depuis l'application
grant select (id, project_id, created_by, created_at, expires_at, revoked_at, revoked_by, last_used_at, use_count)
  on public.project_access_tokens to authenticated;
-- Tâches de production : écriture directe réservée à l'admin (politiques ci-dessous)
grant insert, update, delete on public.project_tasks to authenticated;

create or replace function public.can_access_project(p_project_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_admin()
      or exists (select 1 from public.client_projects p
                  where p.id = p_project_id and public.owns_customer(p.customer_id));
$$;

create policy client_projects_select on public.client_projects for select to authenticated
  using ((select public.is_admin()) or public.owns_customer(customer_id));
create policy project_questionnaires_select on public.project_questionnaires for select to authenticated
  using (public.can_access_project(project_id));
create policy project_files_select on public.project_files for select to authenticated
  using (public.can_access_project(project_id));
create policy project_events_select on public.project_events for select to authenticated
  using (public.can_access_project(project_id));
create policy project_briefs_select on public.project_briefs for select to authenticated
  using (public.can_access_project(project_id));
create policy project_access_tokens_select on public.project_access_tokens for select to authenticated
  using (public.can_access_project(project_id));
create policy project_tasks_select on public.project_tasks for select to authenticated
  using (public.can_access_project(project_id));
create policy project_tasks_admin_write on public.project_tasks for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy notifications_own on public.notifications for select to authenticated
  using (user_id = (select auth.uid()) and (select public.current_app_role()) is not null);

-- -----------------------------------------------------------------------------
-- 5. Historique, activité, notifications (triggers)
-- -----------------------------------------------------------------------------
create or replace function public.project_events_after_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_p record;
  v_title text;
  v_link text;
  u record;
begin
  update public.client_projects set last_activity_at = new.created_at where id = new.project_id;

  if not (new.kind in ('projet_cree', 'questionnaire_commence', 'questionnaire_recu', 'documents_ajoutes',
                       'infos_manquantes', 'brief_genere', 'brief_valide', 'commentaire')
          or (new.kind = 'statut' and new.to_value in ('en_validation_client', 'livre', 'annule'))) then
    return new;
  end if;

  select p.id, p.title, cu.owner_id, c.name as company
    into v_p
    from public.client_projects p
    join public.customers cu on cu.id = p.customer_id
    join public.companies c on c.id = cu.company_id
   where p.id = new.project_id;

  v_title := case new.kind
    when 'projet_cree'            then 'Questionnaire créé'
    when 'questionnaire_commence' then 'Questionnaire commencé'
    when 'questionnaire_recu'     then 'Questionnaire reçu'
    when 'documents_ajoutes'      then 'Nouveaux documents'
    when 'infos_manquantes'       then 'Informations manquantes signalées'
    when 'brief_genere'           then 'Brief généré'
    when 'brief_valide'           then 'Brief validé'
    when 'commentaire'            then 'Nouveau commentaire'
    else case new.to_value
           when 'en_validation_client' then 'Site en validation client'
           when 'livre'                then 'Site livré'
           else 'Projet annulé' end
  end || ' — ' || v_p.company;
  v_link := '/projets/' || new.project_id;

  for u in
    select pr.id from public.profiles pr
     where pr.is_active
       and (pr.role = 'admin' or pr.id = v_p.owner_id)
       and pr.id is distinct from new.actor_id
  loop
    -- Pas de rafale : une seule notification « documents » non lue par projet
    if new.kind = 'documents_ajoutes' and exists (
         select 1 from public.notifications n
          where n.user_id = u.id and n.project_id = new.project_id
            and n.kind = 'documents_ajoutes' and n.read_at is null) then
      continue;
    end if;
    insert into public.notifications (user_id, project_id, kind, title, body, link)
    values (u.id, new.project_id, new.kind, v_title, left(new.body, 300), v_link);
  end loop;
  return new;
end;
$$;
create trigger project_events_after_insert after insert on public.project_events
  for each row execute function public.project_events_after_insert();

create or replace function public._project_event(
  p_project_id uuid, p_kind text, p_body text default null,
  p_from text default null, p_to text default null, p_actor uuid default auth.uid())
returns void
language sql security definer set search_path = public
as $$
  insert into public.project_events (project_id, kind, body, from_value, to_value, actor_id)
  values (p_project_id, p_kind, p_body, p_from, p_to, p_actor);
$$;

-- -----------------------------------------------------------------------------
-- 6. Fonctions internes communes
-- -----------------------------------------------------------------------------
-- Contrôle d'un lot de réponses : objet JSON, clés simples, valeurs bornées.
create or replace function public._check_answers(p_patch jsonb)
returns void
language plpgsql immutable
as $$
declare k text; v jsonb; e jsonb;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'Réponses invalides' using errcode = '22023';
  end if;
  if octet_length(p_patch::text) > 100000 then
    raise exception 'Réponses trop volumineuses' using errcode = '22023';
  end if;
  for k, v in select * from jsonb_each(p_patch) loop
    if k !~ '^[a-z][a-z0-9_]{0,39}$' then
      raise exception 'Champ inconnu : %', left(k, 40) using errcode = '22023';
    end if;
    case jsonb_typeof(v)
      when 'string' then
        if length(v #>> '{}') > 5000 then raise exception 'Texte trop long (%)', k using errcode = '22023'; end if;
      when 'array' then
        if jsonb_array_length(v) > 30 then raise exception 'Trop de choix (%)', k using errcode = '22023'; end if;
        for e in select * from jsonb_array_elements(v) loop
          if jsonb_typeof(e) <> 'string' or length(e #>> '{}') > 300 then
            raise exception 'Choix invalide (%)', k using errcode = '22023';
          end if;
        end loop;
      when 'boolean', 'null', 'number' then null;
      else raise exception 'Valeur invalide (%)', k using errcode = '22023';
    end case;
  end loop;
end;
$$;

-- Enregistre un lot de réponses (fusion) ; journalise le premier enregistrement.
create or replace function public._save_answers(
  p_project_id uuid, p_patch jsonb, p_step integer, p_completion integer, p_via text, p_actor uuid)
returns timestamptz
language plpgsql security definer set search_path = public
as $$
declare v_q public.project_questionnaires%rowtype; v_now timestamptz := now();
begin
  perform public._check_answers(p_patch);
  select * into v_q from public.project_questionnaires where project_id = p_project_id for update;
  if not found then raise exception 'Questionnaire introuvable' using errcode = 'P0002'; end if;
  if octet_length((v_q.answers || p_patch)::text) > 250000 then
    raise exception 'Réponses trop volumineuses' using errcode = '22023';
  end if;
  update public.project_questionnaires
     set answers        = answers || p_patch,
         current_step   = greatest(0, least(5, coalesce(p_step, current_step))),
         completion_pct = greatest(0, least(100, coalesce(p_completion, completion_pct))),
         status         = case when status = 'non_commence' then 'en_cours' else status end,
         started_at     = coalesce(started_at, v_now),
         last_saved_via = p_via,
         last_saved_at  = v_now
   where project_id = p_project_id;
  if v_q.status = 'non_commence' then
    perform public._project_event(p_project_id, 'questionnaire_commence',
      case p_via when 'client' then 'Commencé par le client' else 'Commencé avec le commercial' end, null, null, p_actor);
  end if;
  return v_now;
end;
$$;

create or replace function public._submit_questionnaire(p_project_id uuid, p_consent boolean, p_via text, p_actor uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_q public.project_questionnaires%rowtype; v_status public.project_status;
begin
  if p_consent is not true then
    raise exception 'Merci de cocher la case de confirmation' using errcode = '22023';
  end if;
  select * into v_q from public.project_questionnaires where project_id = p_project_id for update;
  if v_q.status = 'recu' then raise exception 'Questionnaire déjà transmis' using errcode = '22023'; end if;
  update public.project_questionnaires
     set status = 'recu', submitted_at = now(), submitted_via = p_via, submitted_by = p_actor,
         consent_at = now(), started_at = coalesce(started_at, now())
   where project_id = p_project_id;
  select status into v_status from public.client_projects where id = p_project_id for update;
  if v_status = 'en_attente_infos' then
    update public.client_projects set status = 'questionnaire_recu', status_changed_at = now() where id = p_project_id;
  end if;
  perform public._project_event(p_project_id, 'questionnaire_recu',
    case p_via when 'client' then 'Transmis par le client' else 'Transmis par l''équipe' end, null, null, p_actor);
end;
$$;

-- Préparation d'un envoi de fichier (commun équipe / client).
create or replace function public._file_begin(
  p_project_id uuid, p_category text, p_name text, p_mime text, p_size bigint, p_via text, p_actor uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_ext text;
  v_name text;
  v_path text;
begin
  v_ext := case p_mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png'
                       when 'image/webp' then 'webp' when 'application/pdf' then 'pdf' end;
  if v_ext is null then
    raise exception 'Format non accepté (JPG, PNG, WEBP ou PDF uniquement)' using errcode = '22023';
  end if;
  if p_size is null or p_size <= 0 or p_size > 10485760 then
    raise exception 'Fichier trop volumineux (10 Mo maximum)' using errcode = '22023';
  end if;
  if (select count(*) from public.project_files where project_id = p_project_id) >= 150 then
    raise exception 'Nombre maximal de fichiers atteint pour ce projet' using errcode = '22023';
  end if;
  -- Nom affiché : sans chemin ni caractères de contrôle
  v_name := left(btrim(regexp_replace(regexp_replace(coalesce(p_name, ''), '^.*[\\/]', ''), '[[:cntrl:]]', '', 'g')), 160);
  if v_name = '' then v_name := 'document.' || v_ext; end if;
  v_path := p_project_id || '/' || v_id || '.' || v_ext;
  -- Les fichiers en attente depuis plus d'un jour (envoi interrompu) sont oubliés
  delete from public.project_files
   where project_id = p_project_id and status = 'en_attente' and created_at < now() - interval '1 day';
  insert into public.project_files (id, project_id, category, storage_path, original_name, mime_type, size_bytes, uploaded_via, uploaded_by)
  values (v_id, p_project_id, p_category, v_path, v_name, p_mime, p_size, p_via, p_actor);
  return jsonb_build_object('file_id', v_id, 'path', v_path);
end;
$$;

-- Préremplissage à partir du CRM (entreprise, contact, site)
create or replace function public._prefill_answers(p_customer_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare r record; v_sector text; v_code text;
begin
  select c.name, c.sector, c.address, c.postal_code, c.city, c.website, k.phone, k.email
    into r
    from public.customers cu
    join public.companies c on c.id = cu.company_id
    join public.leads l on l.id = cu.lead_id
    left join public.contacts k on k.id = l.contact_id
   where cu.id = p_customer_id;
  v_sector := lower(coalesce(r.sector, ''));
  v_code := case
    when v_sector = '' then null
    when v_sector ~ '(beaut|esth|onglerie|spa)' then 'institut_beaute'
    when v_sector ~ 'coiff|barb' then 'coiffure'
    when v_sector ~ '(artisan|plomb|lectric|menuis|ma[cç]on|peint|couvr|chauffag)' then 'artisan'
    when v_sector ~ '(restau|pizz|traiteur|brasserie|caf[eé]|bar\M|boulang|p[aâ]tiss)' then 'restaurant'
    when v_sector ~ '(coach|sport|fitness|yoga|padel)' then 'coach_sportif'
    when v_sector ~ '(avocat|notaire|cabinet|m[eé]dec|kin[eé]|ost[eé]o|sant[eé]|expert|archi|lib[eé]ral)' then 'profession_liberale'
    when v_sector ~ '(g[iî]te|h[oô]tel|chambre|h[eé]berg|camping)' then 'hebergement'
    when v_sector ~ '(commerce|boutique|magasin|fleur|librair)' then 'commerce'
    else 'autre' end;
  return jsonb_strip_nulls(jsonb_build_object(
    'nom_commercial', r.name,
    'secteur', v_code,
    'secteur_autre', case when v_code = 'autre' then r.sector end,
    'adresse', r.address,
    'ville', r.city,
    'code_postal', r.postal_code,
    'telephone', r.phone,
    'email_public', r.email,
    'site_existant', case when r.website is not null then 'oui' end,
    'site_url', r.website));
end;
$$;

create or replace function public._project_token_hash(p_token text)
returns text
language sql immutable
as $$ select encode(sha256(convert_to(p_token, 'UTF8')), 'hex') $$;

-- Jeton → projet (lève une erreur générique si invalide, expiré ou révoqué)
create or replace function public._project_from_token(p_token text, p_touch boolean default false)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_t public.project_access_tokens%rowtype;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'Ce lien n''est pas valide ou a expiré.' using errcode = '28000';
  end if;
  select t.* into v_t
    from public.project_access_tokens t
    join public.client_projects p on p.id = t.project_id
   where t.token_hash = public._project_token_hash(p_token)
     and t.revoked_at is null and t.expires_at > now()
     and p.status not in ('annule', 'livre');
  if not found then
    raise exception 'Ce lien n''est pas valide ou a expiré.' using errcode = '28000';
  end if;
  if p_touch then
    update public.project_access_tokens set last_used_at = now(), use_count = use_count + 1 where id = v_t.id;
  end if;
  return v_t.project_id;
end;
$$;

create or replace function public._require_project_access(p_project_id uuid)
returns void
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.can_access_project(p_project_id) then
    raise exception 'Projet introuvable ou accès refusé' using errcode = '42501';
  end if;
end;
$$;

create or replace function public._require_admin()
returns void
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs' using errcode = '42501'; end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Fonctions de l'équipe (connectée)
-- -----------------------------------------------------------------------------
create or replace function public.create_client_project(p_contract_id uuid, p_title text default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_k record; v_id uuid;
begin
  select k.id, k.customer_id, k.status, c.name
    into v_k
    from public.contracts k
    join public.customers cu on cu.id = k.customer_id
    join public.companies c on c.id = cu.company_id
   where k.id = p_contract_id;
  if not found or not (public.is_admin() or public.owns_customer(v_k.customer_id)) then
    raise exception 'Contrat introuvable ou accès refusé' using errcode = '42501';
  end if;
  if v_k.status in ('annule', 'resilie') then
    raise exception 'Impossible de créer un projet sur un contrat %', v_k.status using errcode = '22023';
  end if;
  if exists (select 1 from public.client_projects where contract_id = p_contract_id and status <> 'annule') then
    raise exception 'Un projet existe déjà pour ce contrat' using errcode = '23505';
  end if;
  insert into public.client_projects (customer_id, contract_id, title, created_by, assignee_id)
  values (v_k.customer_id, p_contract_id,
          coalesce(nullif(btrim(p_title), ''), 'Site internet — ' || v_k.name),
          auth.uid(),
          (select id from public.profiles where role = 'admin' and is_active order by created_at limit 1))
  returning id into v_id;
  insert into public.project_questionnaires (project_id, answers)
  values (v_id, public._prefill_answers(v_k.customer_id));
  -- Tâches de production standard (modifiables par l'admin)
  insert into public.project_tasks (project_id, title, position, created_by)
  select v_id, t.title, t.n, auth.uid()
    from unnest(array[
      'Analyser le questionnaire et les documents',
      'Maquette de la page d''accueil',
      'Intégration des contenus et photos',
      'Pages secondaires',
      'Formulaire de contact et liens (téléphone, réseaux)',
      'Adaptation mobile et tablette',
      'SEO de base (titres, descriptions, Google Business)',
      'Recette : relecture, liens, formulaires',
      'Présentation au client',
      'Mise en ligne et nom de domaine'
    ]) with ordinality as t(title, n);
  perform public._project_event(v_id, 'projet_cree', 'Projet et questionnaire créés (prérempli depuis le CRM)');
  return v_id;
end;
$$;

create or replace function public.project_save_answers(
  p_project_id uuid, p_patch jsonb, p_step integer default null, p_completion integer default null)
returns timestamptz
language plpgsql security definer set search_path = public
as $$
declare v_status public.questionnaire_status;
begin
  perform public._require_project_access(p_project_id);
  select status into v_status from public.project_questionnaires where project_id = p_project_id;
  -- Après réception, seul l'admin corrige les réponses
  if v_status = 'recu' and not public.is_admin() then
    raise exception 'Questionnaire déjà transmis : seul un administrateur peut le modifier' using errcode = '42501';
  end if;
  if v_status = 'recu' then
    perform public._project_event(p_project_id, 'modification', 'Réponses corrigées : ' ||
      (select string_agg(k, ', ') from jsonb_object_keys(p_patch) k));
  end if;
  return public._save_answers(p_project_id, p_patch, p_step, p_completion, 'equipe', auth.uid());
end;
$$;

create or replace function public.project_submit_questionnaire(p_project_id uuid, p_consent boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public._require_project_access(p_project_id);
  perform public._submit_questionnaire(p_project_id, p_consent, 'equipe', auth.uid());
end;
$$;

-- Lien client : renvoie le jeton EN CLAIR une seule fois ; les anciens liens sont révoqués.
create or replace function public.create_project_link(p_project_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_token text; v_expires timestamptz; v_status public.project_status;
begin
  perform public._require_project_access(p_project_id);
  select status into v_status from public.client_projects where id = p_project_id;
  if v_status in ('annule', 'livre') then
    raise exception 'Projet clôturé : aucun lien ne peut être créé' using errcode = '22023';
  end if;
  update public.project_access_tokens set revoked_at = now(), revoked_by = auth.uid()
   where project_id = p_project_id and revoked_at is null;
  -- 2 UUID v4 (générateur cryptographique de PostgreSQL) → 64 caractères hexadécimaux
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_expires := now() + make_interval(days => coalesce((select project_link_days from public.app_settings limit 1), 60));
  insert into public.project_access_tokens (project_id, token_hash, created_by, expires_at)
  values (p_project_id, public._project_token_hash(v_token), auth.uid(), v_expires);
  perform public._project_event(p_project_id, 'lien_cree', 'Lien valable jusqu''au ' || to_char(v_expires, 'DD/MM/YYYY'));
  return jsonb_build_object('token', v_token, 'expires_at', v_expires);
end;
$$;

create or replace function public.revoke_project_links(p_project_id uuid)
returns integer
language plpgsql security definer set search_path = public
as $$
declare n integer;
begin
  perform public._require_project_access(p_project_id);
  update public.project_access_tokens set revoked_at = now(), revoked_by = auth.uid()
   where project_id = p_project_id and revoked_at is null;
  get diagnostics n = row_count;
  if n > 0 then perform public._project_event(p_project_id, 'lien_revoque', 'Lien client désactivé'); end if;
  return n;
end;
$$;

create or replace function public.add_project_comment(p_project_id uuid, p_body text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public._require_project_access(p_project_id);
  if nullif(btrim(p_body), '') is null then raise exception 'Commentaire vide' using errcode = '22023'; end if;
  perform public._project_event(p_project_id, 'commentaire', left(btrim(p_body), 4000));
end;
$$;

-- Demande de compléments : rouvre le questionnaire et repasse le projet en attente.
create or replace function public.flag_missing_info(p_project_id uuid, p_message text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_status public.project_status;
begin
  perform public._require_project_access(p_project_id);
  if nullif(btrim(p_message), '') is null then
    raise exception 'Précisez les informations attendues' using errcode = '22023';
  end if;
  select status into v_status from public.client_projects where id = p_project_id for update;
  if v_status in ('livre', 'annule') then raise exception 'Projet clôturé' using errcode = '22023'; end if;
  update public.project_questionnaires
     set status = 'en_cours', submitted_at = null, submitted_via = null, submitted_by = null, consent_at = null
   where project_id = p_project_id and status = 'recu';
  if v_status in ('questionnaire_recu', 'brief_a_valider') then
    update public.client_projects set status = 'en_attente_infos', status_changed_at = now() where id = p_project_id;
    perform public._project_event(p_project_id, 'statut', null, v_status::text, 'en_attente_infos');
  end if;
  perform public._project_event(p_project_id, 'infos_manquantes', left(btrim(p_message), 4000));
end;
$$;

-- Changement de statut (admin). Synchronise la production sur le contrat.
create or replace function public.set_project_status(
  p_project_id uuid, p_status public.project_status, p_note text default null, p_site_url text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_p public.client_projects%rowtype;
  v_days integer := coalesce((select project_delivery_days from public.app_settings limit 1), 10);
  v_url text;
begin
  perform public._require_admin();
  select * into v_p from public.client_projects where id = p_project_id for update;
  if not found then raise exception 'Projet introuvable' using errcode = 'P0002'; end if;
  if v_p.status = p_status then return; end if;
  if v_p.status in ('livre', 'annule') then
    raise exception 'Projet clôturé : statut définitif' using errcode = '22023';
  end if;
  if p_status = 'annule' and nullif(btrim(p_note), '') is null then
    raise exception 'Le motif d''annulation est obligatoire' using errcode = '22023';
  end if;
  v_url := coalesce(nullif(btrim(p_site_url), ''), v_p.site_url);
  if p_status = 'livre' and v_url is null then
    raise exception 'Indiquez l''adresse du site livré' using errcode = '22023';
  end if;

  update public.client_projects
     set status = p_status,
         status_changed_at = now(),
         site_url = v_url,
         scope_validated_at = case when p_status = 'pret_a_produire' then coalesce(scope_validated_at, now()) else scope_validated_at end,
         target_date = case when p_status = 'pret_a_produire' and target_date is null
                            then current_date + v_days else target_date end,
         delivered_at = case when p_status = 'livre' then now() else delivered_at end,
         cancel_reason = case when p_status = 'annule' then btrim(p_note) else cancel_reason end
   where id = p_project_id;

  -- Les liens client n'ont plus d'objet une fois le projet clôturé
  if p_status in ('livre', 'annule') then
    update public.project_access_tokens set revoked_at = now(), revoked_by = auth.uid()
     where project_id = p_project_id and revoked_at is null;
  end if;

  -- Suivi de production du contrat (la mise en ligne active l'abonnement, cf. 0012)
  if v_p.contract_id is not null then
    if p_status = 'en_creation' then
      update public.contracts set site_status = 'en_cours'
       where id = v_p.contract_id and site_status = 'a_produire';
    elsif p_status = 'en_validation_client' then
      update public.contracts set site_status = 'en_validation'
       where id = v_p.contract_id and site_status in ('a_produire', 'en_cours');
    elsif p_status = 'livre' then
      update public.contracts set site_url = v_url, site_status = 'en_ligne'
       where id = v_p.contract_id and status in ('signe', 'actif');
    end if;
  end if;

  perform public._project_event(p_project_id, 'statut', nullif(btrim(p_note), ''), v_p.status::text, p_status::text);
end;
$$;

create or replace function public.update_project(p_project_id uuid, p_patch jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_p public.client_projects%rowtype; v_changes text[] := '{}';
begin
  perform public._require_admin();
  select * into v_p from public.client_projects where id = p_project_id for update;
  if not found then raise exception 'Projet introuvable' using errcode = 'P0002'; end if;
  if p_patch ? 'title' then
    update public.client_projects set title = btrim(p_patch ->> 'title') where id = p_project_id;
    v_changes := v_changes || 'titre';
  end if;
  if p_patch ? 'assignee_id' then
    update public.client_projects set assignee_id = nullif(p_patch ->> 'assignee_id', '')::uuid where id = p_project_id;
    v_changes := v_changes || 'responsable';
  end if;
  if p_patch ? 'target_date' then
    update public.client_projects set target_date = nullif(p_patch ->> 'target_date', '')::date where id = p_project_id;
    v_changes := v_changes || ('date cible : ' || coalesce(to_char(nullif(p_patch ->> 'target_date', '')::date, 'DD/MM/YYYY'), 'aucune'));
  end if;
  if p_patch ? 'next_action' then
    update public.client_projects set next_action = nullif(btrim(p_patch ->> 'next_action'), '') where id = p_project_id;
    v_changes := v_changes || 'prochaine action';
  end if;
  if p_patch ? 'site_url' then
    update public.client_projects set site_url = nullif(btrim(p_patch ->> 'site_url'), '') where id = p_project_id;
    v_changes := v_changes || 'adresse du site';
  end if;
  if cardinality(v_changes) > 0 then
    perform public._project_event(p_project_id, 'modification', 'Modifié : ' || array_to_string(v_changes, ', '));
  end if;
end;
$$;

create or replace function public.save_project_brief(p_project_id uuid, p_content text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid; v_version integer; v_status public.project_status;
begin
  perform public._require_admin();
  select status into v_status from public.client_projects where id = p_project_id for update;
  if not found then raise exception 'Projet introuvable' using errcode = 'P0002'; end if;
  select coalesce(max(version), 0) + 1 into v_version from public.project_briefs where project_id = p_project_id;
  insert into public.project_briefs (project_id, version, content, generated_by)
  values (p_project_id, v_version, p_content, auth.uid()) returning id into v_id;
  perform public._project_event(p_project_id, 'brief_genere', 'Version ' || v_version);
  if v_status = 'questionnaire_recu' then
    update public.client_projects set status = 'brief_a_valider', status_changed_at = now() where id = p_project_id;
    perform public._project_event(p_project_id, 'statut', null, 'questionnaire_recu', 'brief_a_valider');
  end if;
  return v_id;
end;
$$;

-- Validation du brief = validation du périmètre → prêt à produire, date cible calculée.
create or replace function public.validate_project_brief(p_brief_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_b public.project_briefs%rowtype; v_status public.project_status;
begin
  perform public._require_admin();
  select * into v_b from public.project_briefs where id = p_brief_id for update;
  if not found then raise exception 'Brief introuvable' using errcode = 'P0002'; end if;
  if v_b.validated_at is not null then return; end if;
  update public.project_briefs set validated_at = now(), validated_by = auth.uid() where id = p_brief_id;
  perform public._project_event(v_b.project_id, 'brief_valide', 'Version ' || v_b.version || ' validée');
  select status into v_status from public.client_projects where id = v_b.project_id;
  if v_status in ('en_attente_infos', 'questionnaire_recu', 'brief_a_valider') then
    perform public.set_project_status(v_b.project_id, 'pret_a_produire', 'Brief validé : périmètre arrêté');
  end if;
end;
$$;

create or replace function public.project_file_begin(
  p_project_id uuid, p_category text, p_name text, p_mime text, p_size bigint)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  perform public._require_project_access(p_project_id);
  if (select status from public.client_projects where id = p_project_id) = 'annule' then
    raise exception 'Projet annulé' using errcode = '22023';
  end if;
  return public._file_begin(p_project_id, p_category, p_name, p_mime, p_size, 'equipe', auth.uid());
end;
$$;

-- Suppression d'un document par l'équipe : renvoie le chemin à effacer du stockage.
create or replace function public.project_file_delete(p_file_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare v_f public.project_files%rowtype;
begin
  select * into v_f from public.project_files where id = p_file_id for update;
  if not found then raise exception 'Document introuvable' using errcode = 'P0002'; end if;
  perform public._require_project_access(v_f.project_id);
  if not public.is_admin() and v_f.uploaded_by is distinct from auth.uid() then
    raise exception 'Seul un administrateur peut supprimer ce document' using errcode = '42501';
  end if;
  delete from public.project_files where id = p_file_id;
  perform public._project_event(v_f.project_id, 'document_supprime', v_f.original_name);
  return v_f.storage_path;
end;
$$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql security definer set search_path = public
as $$
declare n integer;
begin
  update public.notifications set read_at = now()
   where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics n = row_count;
  return n;
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. Fonctions du PORTAIL CLIENT (sans compte, par jeton)
-- -----------------------------------------------------------------------------
create or replace function public.portal_open(p_token text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_id uuid; v_out jsonb;
begin
  v_id := public._project_from_token(p_token, true);
  select jsonb_build_object(
    'project', jsonb_build_object('title', p.title, 'company_name', c.name, 'status', p.status),
    'questionnaire', jsonb_build_object(
      'status', q.status, 'answers', q.answers, 'current_step', q.current_step,
      'completion_pct', q.completion_pct, 'submitted_at', q.submitted_at, 'last_saved_at', q.last_saved_at),
    'files', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'category', f.category, 'name', f.original_name,
                                          'size', f.size_bytes, 'mime', f.mime_type, 'via', f.uploaded_via,
                                          'created_at', f.created_at) order by f.created_at)
        from public.project_files f where f.project_id = p.id and f.status = 'valide'), '[]'::jsonb),
    'missing_message', (
      select e.body from public.project_events e
       where e.project_id = p.id and e.kind = 'infos_manquantes' and q.status <> 'recu'
       order by e.created_at desc limit 1),
    'planning_monthly_cents', (select monthly_price_cents from public.offers where code = 'option_planning'),
    'privacy_policy_url', s.privacy_policy_url,
    'contact_email', s.contact_email)
    into v_out
    from public.client_projects p
    join public.customers cu on cu.id = p.customer_id
    join public.companies c on c.id = cu.company_id
    join public.project_questionnaires q on q.project_id = p.id
    left join public.app_settings s on true
   where p.id = v_id;
  return v_out;
end;
$$;

create or replace function public.portal_save(
  p_token text, p_patch jsonb, p_step integer default null, p_completion integer default null)
returns timestamptz
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  v_id := public._project_from_token(p_token);
  if (select status from public.project_questionnaires where project_id = v_id) = 'recu' then
    raise exception 'Votre questionnaire a déjà été transmis. Contactez Moka Studio pour toute modification.' using errcode = '22023';
  end if;
  return public._save_answers(v_id, p_patch, p_step, p_completion, 'client', null);
end;
$$;

create or replace function public.portal_submit(p_token text, p_consent boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public._submit_questionnaire(public._project_from_token(p_token), p_consent, 'client', null);
end;
$$;

create or replace function public.portal_file_begin(
  p_token text, p_category text, p_name text, p_mime text, p_size bigint)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  return public._file_begin(public._project_from_token(p_token), p_category, p_name, p_mime, p_size, 'client', null);
end;
$$;

-- Le client peut retirer un document qu'il a envoyé, tant que le questionnaire n'est pas transmis.
create or replace function public.portal_file_delete(p_token text, p_file_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare v_id uuid; v_f public.project_files%rowtype;
begin
  v_id := public._project_from_token(p_token);
  select * into v_f from public.project_files where id = p_file_id and project_id = v_id for update;
  if not found or v_f.uploaded_via <> 'client' then
    raise exception 'Document introuvable' using errcode = 'P0002';
  end if;
  if (select status from public.project_questionnaires where project_id = v_id) = 'recu' then
    raise exception 'Questionnaire transmis : contactez Moka Studio pour retirer un document' using errcode = '22023';
  end if;
  delete from public.project_files where id = p_file_id;
  perform public._project_event(v_id, 'document_supprime', v_f.original_name || ' (retiré par le client)', null, null, null);
  return v_f.storage_path;
end;
$$;

-- Le document appartient-il au projet de l'appelant ? (contrôle avant confirmation)
create or replace function public.portal_file_owned(p_token text, p_file_id uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  return exists (select 1 from public.project_files
                  where id = p_file_id and project_id = public._project_from_token(p_token));
end;
$$;

create or replace function public.project_file_owned(p_file_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.project_files f where f.id = p_file_id and public.can_access_project(f.project_id));
$$;

-- Appelée par la fonction serveur après contrôle du contenu réel du fichier.
create or replace function public.project_file_confirm(p_file_id uuid, p_ok boolean)
returns text
language plpgsql security definer set search_path = public
as $$
declare v_f public.project_files%rowtype; v_label text;
begin
  select * into v_f from public.project_files where id = p_file_id for update;
  if not found then raise exception 'Document introuvable' using errcode = 'P0002'; end if;
  if not p_ok then
    delete from public.project_files where id = p_file_id;
    return v_f.storage_path;
  end if;
  if v_f.status = 'valide' then return null; end if;
  update public.project_files set status = 'valide', confirmed_at = now() where id = p_file_id;
  v_label := case v_f.category
    when 'logo' then 'Logo' when 'photos_etablissement' then 'Photos de l''établissement'
    when 'photos_prestations' then 'Photos des prestations' when 'photos_realisations' then 'Photos des réalisations'
    when 'portraits_equipe' then 'Portraits de l''équipe' when 'plaquette_tarifaire' then 'Plaquette tarifaire'
    when 'carte_prestations' then 'Carte des prestations' else 'Document' end;
  perform public._project_event(v_f.project_id, 'documents_ajoutes',
    v_label || ' : ' || v_f.original_name || case v_f.uploaded_via when 'client' then ' (envoyé par le client)' else '' end,
    null, null, v_f.uploaded_by);
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. Droits d'exécution
-- -----------------------------------------------------------------------------
do $$
declare f text;
begin
  -- Fonctions internes : jamais appelables depuis l'application
  foreach f in array array[
    'public._project_event(uuid, text, text, text, text, uuid)',
    'public._check_answers(jsonb)',
    'public._save_answers(uuid, jsonb, integer, integer, text, uuid)',
    'public._submit_questionnaire(uuid, boolean, text, uuid)',
    'public._file_begin(uuid, text, text, text, bigint, text, uuid)',
    'public._prefill_answers(uuid)',
    'public._project_from_token(text, boolean)',
    'public._require_project_access(uuid)',
    'public._require_admin()',
    'public.project_file_confirm(uuid, boolean)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
  -- Équipe connectée
  foreach f in array array[
    'public.create_client_project(uuid, text)', 'public.project_save_answers(uuid, jsonb, integer, integer)',
    'public.project_submit_questionnaire(uuid, boolean)', 'public.create_project_link(uuid)',
    'public.revoke_project_links(uuid)', 'public.add_project_comment(uuid, text)',
    'public.flag_missing_info(uuid, text)', 'public.set_project_status(uuid, public.project_status, text, text)',
    'public.update_project(uuid, jsonb)', 'public.save_project_brief(uuid, text)',
    'public.validate_project_brief(uuid)', 'public.project_file_begin(uuid, text, text, text, bigint)',
    'public.project_file_delete(uuid)', 'public.mark_notifications_read(uuid[])', 'public.can_access_project(uuid)',
    'public.project_file_owned(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  -- Portail client (sans compte) : seules portes d'entrée, chacune vérifie le jeton
  foreach f in array array[
    'public.portal_open(text)', 'public.portal_save(text, jsonb, integer, integer)',
    'public.portal_submit(text, boolean)', 'public.portal_file_begin(text, text, text, text, bigint)',
    'public.portal_file_delete(text, uuid)', 'public.portal_file_owned(text, uuid)'
  ] loop
    execute format('revoke execute on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end;
$$;
grant execute on function public.project_file_confirm(uuid, boolean) to service_role;

-- -----------------------------------------------------------------------------
-- 10. Vue de pilotage
-- -----------------------------------------------------------------------------
create or replace view public.project_overview
with (security_invoker = true)
as
select
  p.id, p.customer_id, p.contract_id, p.title, p.status, p.assignee_id, p.target_date,
  p.scope_validated_at, p.delivered_at, p.site_url, p.next_action, p.cancel_reason,
  p.status_changed_at, p.last_activity_at, p.created_by, p.created_at,
  c.name as company_name, c.sector, c.city,
  cu.owner_id, o.full_name as owner_name,
  a.full_name as assignee_name,
  k.reference as contract_reference, k.offer_code, k.with_planning_option,
  q.status as questionnaire_status, q.completion_pct, q.submitted_at, q.last_saved_at,
  (select count(*) from public.project_files f where f.project_id = p.id and f.status = 'valide')::integer as files_count,
  (select count(*) from public.project_tasks t where t.project_id = p.id and t.status <> 'fait')::integer as open_tasks,
  exists (select 1 from public.project_access_tokens t
           where t.project_id = p.id and t.revoked_at is null and t.expires_at > now()) as link_active,
  (p.target_date is not null and p.target_date < current_date and p.status not in ('livre', 'annule')) as is_late
from public.client_projects p
join public.customers cu on cu.id = p.customer_id
join public.companies c on c.id = cu.company_id
left join public.contracts k on k.id = p.contract_id
left join public.profiles o on o.id = cu.owner_id
left join public.profiles a on a.id = p.assignee_id
left join public.project_questionnaires q on q.project_id = p.id;

grant select on public.project_overview to authenticated;
revoke all on public.project_overview from anon;

-- -----------------------------------------------------------------------------
-- 11. Stockage privé des documents (Supabase Storage)
--   * bucket privé, 10 Mo max, JPG/PNG/WEBP/PDF (contrôlé par le serveur de stockage)
--   * dépôt uniquement via la fonction serveur « project-files » (URL signées)
--   * lecture : URL signées temporaires, pour l'équipe ayant accès au projet
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-files', 'project-files', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.project_id_from_path(p_name text)
returns uuid
language sql immutable
as $$
  select case when split_part(p_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(p_name, '/', 1)::uuid end
$$;

drop policy if exists project_files_team_read on storage.objects;
create policy project_files_team_read on storage.objects for select to authenticated
  using (bucket_id = 'project-files' and public.can_access_project(public.project_id_from_path(name)));
