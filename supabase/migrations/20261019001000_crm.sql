-- =============================================================================
-- Migration 0010 : CRM — historique automatique, doublons, création de
-- prospects (commercial, admin, apporteur), vues de lecture, relances.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Paramètre « prospect inactif depuis N jours », lisible par tout utilisateur actif
-- -----------------------------------------------------------------------------
create or replace function public.stale_lead_days()
returns integer
language sql stable security definer set search_path = public
as $$
  select case when public.current_app_role() is not null
              then (select stale_lead_days from public.app_settings where id) end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Prospects : horodatage du statut + historique automatique
-- -----------------------------------------------------------------------------
create or replace function public.leads_before_write()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    new.status_changed_at := now();
    if new.status <> 'perdu' then new.lost_reason := null; end if;
  end if;
  if new.lost_reason is not null then new.lost_reason := nullif(btrim(new.lost_reason), ''); end if;
  return new;
end;
$$;
-- Nom choisi pour s'exécuter AVANT leads_guard (ordre alphabétique des triggers)
create trigger leads_a_before_write before insert or update on public.leads
  for each row execute function public.leads_before_write();

create or replace function public.leads_log_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.lead_activities (lead_id, actor_id, kind, to_value)
    values (new.id, auth.uid(), 'creation', new.status::text);
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.lead_activities (lead_id, actor_id, kind, from_value, to_value, body)
    values (new.id, auth.uid(), 'changement_statut', old.status::text, new.status::text,
            case when new.status = 'perdu' then new.lost_reason end);
  end if;

  if new.owner_id is distinct from old.owner_id then
    insert into public.lead_activities (lead_id, actor_id, kind, from_value, to_value)
    values (new.id, auth.uid(), 'changement_responsable',
            coalesce((select full_name from public.profiles where id = old.owner_id), 'Non attribué'),
            coalesce((select full_name from public.profiles where id = new.owner_id), 'Non attribué'));
  end if;
  return new;
end;
$$;
create trigger leads_log_changes after insert or update on public.leads
  for each row execute function public.leads_log_changes();

-- Un appel / email / SMS / RDV consigné met à jour « dernier contact ».
create or replace function public.lead_activities_touch_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kind in ('appel', 'email', 'sms', 'rendez_vous') then
    update public.leads
       set last_contact_at = greatest(coalesce(last_contact_at, new.occurred_at), new.occurred_at)
     where id = new.lead_id;
  end if;
  return new;
end;
$$;
create trigger lead_activities_touch_lead after insert on public.lead_activities
  for each row execute function public.lead_activities_touch_lead();

-- Tâches : la date de réalisation suit le statut.
create or replace function public.tasks_before_write()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'fait' and new.completed_at is null then new.completed_at := now(); end if;
  if new.status <> 'fait' then new.completed_at := null; end if;
  return new;
end;
$$;
create trigger tasks_a_before_write before insert or update on public.tasks
  for each row execute function public.tasks_before_write();

-- -----------------------------------------------------------------------------
-- 3. Détection des doublons
--    SIREN, email, téléphone : bloquants. Domaine du site : avertissement.
-- -----------------------------------------------------------------------------
create or replace function public.find_duplicates(
  p_siren   text default null,
  p_email   text default null,
  p_phone   text default null,
  p_website text default null)
returns table (
  company_id    uuid,
  company_name  text,
  city          text,
  match_kind    text,
  is_blocking   boolean,
  mine          boolean,
  has_open_lead boolean)
language sql stable security definer set search_path = public
as $$
  with params as (
    select nullif(regexp_replace(coalesce(p_siren, ''), '\s', '', 'g'), '') as siren,
           public.normalize_email(p_email)   as email,
           public.normalize_phone(p_phone)   as phone,
           public.normalize_domain(p_website) as domain
  ),
  matches as (
    select c.id, 'siren'::text as kind, true as blocking
      from public.companies c, params p where p.siren is not null and c.siren = p.siren
    union
    select k.company_id, 'email', true
      from public.contacts k, params p where p.email is not null and k.email_normalized = p.email
    union
    select k.company_id, 'telephone', true
      from public.contacts k, params p where length(p.phone) >= 9 and k.phone_normalized = p.phone
    union
    select c.id, 'site', false
      from public.companies c, params p where p.domain is not null and c.website_domain = p.domain
  )
  select c.id, c.name, c.city, m.kind, m.blocking,
         exists (select 1 from public.leads l where l.company_id = c.id and l.owner_id = auth.uid())
           or exists (select 1 from public.customers cu where cu.company_id = c.id and cu.owner_id = auth.uid()),
         exists (select 1 from public.leads l where l.company_id = c.id and l.status not in ('gagne', 'perdu'))
  from matches m
  join public.companies c on c.id = m.id
  where public.current_app_role() in ('admin', 'commercial')
  order by m.blocking desc, c.name;
$$;

-- -----------------------------------------------------------------------------
-- 4. Création d'un prospect (entreprise + contact + prospect, en une fois)
-- -----------------------------------------------------------------------------
-- Cœur interne : non appelable depuis l'application.
create or replace function public._create_lead_core(
  p_company   jsonb,
  p_contact   jsonb,
  p_source    public.lead_source,
  p_owner     uuid,
  p_referrer  uuid,
  p_notes     text,
  p_follow_up timestamptz)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_contact uuid;
  v_lead    uuid;
  v_name    text := nullif(btrim(p_company ->> 'name'), '');
  v_siren   text := nullif(regexp_replace(coalesce(p_company ->> 'siren', ''), '\s', '', 'g'), '');
  v_first   text := nullif(btrim(p_contact ->> 'first_name'), '');
  v_last    text := nullif(btrim(p_contact ->> 'last_name'), '');
  v_email   text := nullif(btrim(p_contact ->> 'email'), '');
  v_phone   text := nullif(btrim(p_contact ->> 'phone'), '');
begin
  if v_name is null then
    raise exception 'Le nom de l''entreprise est obligatoire' using errcode = '22023';
  end if;
  if v_siren is not null and v_siren !~ '^\d{9}$' then
    raise exception 'Le SIREN doit comporter 9 chiffres' using errcode = '22023';
  end if;

  insert into public.companies (name, siren, sector, address, postal_code, city, website, created_by)
  values (v_name, v_siren,
          nullif(btrim(p_company ->> 'sector'), ''),
          nullif(btrim(p_company ->> 'address'), ''),
          nullif(btrim(p_company ->> 'postal_code'), ''),
          nullif(btrim(p_company ->> 'city'), ''),
          nullif(btrim(p_company ->> 'website'), ''),
          auth.uid())
  returning id into v_company;

  if coalesce(v_first, v_last, v_email, v_phone) is not null then
    insert into public.contacts (company_id, first_name, last_name, job_title, email, phone, is_primary)
    values (v_company, v_first, v_last, nullif(btrim(p_contact ->> 'job_title'), ''), v_email, v_phone, true)
    returning id into v_contact;
  end if;

  insert into public.leads (company_id, contact_id, source, owner_id, referrer_id, created_by, notes, next_follow_up_at)
  values (v_company, v_contact, p_source, p_owner, p_referrer, auth.uid(), nullif(btrim(p_notes), ''), p_follow_up)
  returning id into v_lead;

  return v_lead;
end;
$$;
revoke execute on function public._create_lead_core(jsonb, jsonb, public.lead_source, uuid, uuid, text, timestamptz)
  from public, anon, authenticated;

-- Commercial (prospect à son nom) ou admin (responsable au choix, forçage possible
-- d'un doublon email/téléphone ; un SIREN reste toujours unique).
create or replace function public.create_lead(
  p_company        jsonb,
  p_contact        jsonb default '{}'::jsonb,
  p_source         public.lead_source default 'prospection',
  p_owner_id       uuid default null,
  p_notes          text default null,
  p_next_follow_up timestamptz default null,
  p_force          boolean default false)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role  public.user_role := public.current_app_role();
  v_owner uuid;
  v_dup   record;
begin
  if v_role is null or v_role not in ('admin', 'commercial') then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;

  v_owner := case when v_role = 'admin' then p_owner_id else auth.uid() end;
  if v_owner is not null and not exists (
       select 1 from public.profiles where id = v_owner and is_active and role in ('admin', 'commercial')) then
    raise exception 'Responsable invalide' using errcode = '22023';
  end if;

  for v_dup in
    select * from public.find_duplicates(p_company ->> 'siren', p_contact ->> 'email', p_contact ->> 'phone', p_company ->> 'website')
    where is_blocking
  loop
    if v_dup.match_kind = 'siren' or not (p_force and v_role = 'admin') then
      raise exception 'Doublon : « % » existe déjà (même %)', v_dup.company_name,
        case v_dup.match_kind when 'siren' then 'SIREN' when 'email' then 'email' else 'téléphone' end
        using errcode = '23505', hint = v_dup.company_id::text;
    end if;
  end loop;

  return public._create_lead_core(p_company, p_contact, p_source, v_owner, null, p_notes, p_next_follow_up);
end;
$$;

-- Apporteur : dépôt d'un prospect. Ne révèle jamais qui détient un doublon.
create or replace function public.submit_referral(
  p_company jsonb,
  p_contact jsonb default '{}'::jsonb,
  p_notes   text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_app_role() is distinct from 'apporteur' then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.companies c, (select nullif(regexp_replace(coalesce(p_company ->> 'siren', ''), '\s', '', 'g'), '') s) x
    where x.s is not null and c.siren = x.s
    union all
    select 1 from public.contacts k
    where (public.normalize_email(p_contact ->> 'email') is not null
           and k.email_normalized = public.normalize_email(p_contact ->> 'email'))
       or (length(public.normalize_phone(p_contact ->> 'phone')) >= 9
           and k.phone_normalized = public.normalize_phone(p_contact ->> 'phone'))
  ) then
    raise exception 'Ce prospect est déjà connu de Moka Studio.' using errcode = '23505';
  end if;

  return public._create_lead_core(p_company, p_contact, 'apporteur', null, auth.uid(), p_notes, null);
end;
$$;

-- Suivi des prospects transmis : statut uniquement, rien de confidentiel.
create or replace function public.my_referrals()
returns table (
  id                uuid,
  company_name      text,
  city              text,
  status            public.lead_status,
  created_at        timestamptz,
  status_changed_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select l.id, c.name, c.city, l.status, l.created_at, l.status_changed_at
  from public.leads l
  join public.companies c on c.id = l.company_id
  where public.current_app_role() = 'apporteur'
    and l.referrer_id = auth.uid()
  order by l.created_at desc;
$$;

-- Historique d'un prospect avec le nom de l'auteur.
create or replace function public.lead_timeline(p_lead_id uuid)
returns table (
  id          uuid,
  kind        public.activity_kind,
  from_value  text,
  to_value    text,
  body        text,
  occurred_at timestamptz,
  actor_name  text)
language sql stable security definer set search_path = public
as $$
  select a.id, a.kind, a.from_value, a.to_value, a.body, a.occurred_at, p.full_name
  from public.lead_activities a
  left join public.profiles p on p.id = a.actor_id
  where a.lead_id = p_lead_id
    and (public.is_admin() or public.owns_lead(p_lead_id))
  order by a.occurred_at desc, a.created_at desc;
$$;

-- -----------------------------------------------------------------------------
-- 5. Vues de lecture (security_invoker : la RLS de l'utilisateur s'applique)
-- -----------------------------------------------------------------------------
create or replace view public.lead_overview
with (security_invoker = true)
as
select
  l.id, l.company_id, l.contact_id, l.status, l.source, l.owner_id, l.referrer_id,
  l.created_by, l.last_contact_at, l.next_follow_up_at, l.status_changed_at,
  l.lost_reason, l.notes, l.created_at, l.updated_at,
  c.name        as company_name,
  c.siren, c.sector, c.address, c.postal_code, c.city, c.website,
  k.first_name  as contact_first_name,
  k.last_name   as contact_last_name,
  k.email       as contact_email,
  k.phone       as contact_phone,
  o.full_name   as owner_name,
  r.full_name   as referrer_name,
  coalesce(l.last_contact_at, l.created_at) as last_activity_at,
  (select count(*) from public.tasks t
    where t.lead_id = l.id and t.status in ('a_faire', 'en_cours'))::integer as open_tasks,
  (select min(t.due_at) from public.tasks t
    where t.lead_id = l.id and t.status in ('a_faire', 'en_cours')) as next_task_due_at
from public.leads l
join public.companies c on c.id = l.company_id
left join public.contacts k on k.id = l.contact_id
left join public.profiles o on o.id = l.owner_id
left join public.profiles r on r.id = l.referrer_id;

create or replace view public.task_overview
with (security_invoker = true)
as
select
  t.id, t.lead_id, t.customer_id, t.type, t.title, t.description, t.due_at,
  t.priority, t.status, t.assignee_id, t.created_by, t.completed_at, t.created_at, t.updated_at,
  coalesce(c.name, cc.name) as company_name,
  l.status      as lead_status,
  a.full_name   as assignee_name
from public.tasks t
left join public.leads l      on l.id = t.lead_id
left join public.companies c  on c.id = l.company_id
left join public.customers cu on cu.id = t.customer_id
left join public.companies cc on cc.id = cu.company_id
left join public.profiles a   on a.id = t.assignee_id;

grant select on public.lead_overview, public.task_overview to authenticated;
revoke all on public.lead_overview, public.task_overview from anon;
