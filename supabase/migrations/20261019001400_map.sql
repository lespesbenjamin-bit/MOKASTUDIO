-- =============================================================================
-- Migration 0014 : cartographie — coordonnées GPS des entreprises
--
-- Les coordonnées sont calculées dans le navigateur à partir de l'adresse
-- (service officiel Géoplateforme / Base Adresse Nationale) puis enregistrées
-- ici. Si l'adresse change, les coordonnées sont effacées pour être recalculées.
-- =============================================================================

alter table public.companies
  add column if not exists latitude          double precision check (latitude between -90 and 90),
  add column if not exists longitude         double precision check (longitude between -180 and 180),
  add column if not exists geocode_precision text check (geocode_precision in ('adresse', 'rue', 'ville', 'manuel', 'introuvable')),
  add column if not exists geocode_label     text,
  add column if not exists geocoded_at       timestamptz;

alter table public.companies
  add constraint companies_coords_pair check ((latitude is null) = (longitude is null));

create index if not exists companies_to_geocode_idx on public.companies (created_at) where geocoded_at is null;

-- Adresse modifiée → coordonnées à recalculer (sauf position posée à la main
-- dans la même mise à jour).
create or replace function public.companies_reset_geocode()
returns trigger
language plpgsql
as $$
begin
  if (new.address, new.postal_code, new.city) is distinct from (old.address, old.postal_code, old.city)
     and new.geocoded_at is not distinct from old.geocoded_at then
    new.latitude := null;
    new.longitude := null;
    new.geocode_precision := null;
    new.geocode_label := null;
    new.geocoded_at := null;
  end if;
  return new;
end;
$$;
create trigger companies_a_reset_geocode before update on public.companies
  for each row execute function public.companies_reset_geocode();

-- -----------------------------------------------------------------------------
-- Points de la carte : un point par entreprise visible
--   * client  : contrat signé ou actif
--   * prospect : prospect le plus récent (hors entreprises déjà clientes)
-- security_invoker : chaque utilisateur ne voit que ce que la RLS lui permet.
-- -----------------------------------------------------------------------------
create or replace view public.map_points
with (security_invoker = true)
as
with clients as (
  select distinct on (k.company_id)
         k.company_id, k.id as contract_id, k.lead_id, k.owner_id, k.owner_name,
         k.offer_code, k.site_status, k.overdue_payments
  from public.contract_overview k
  where k.status in ('signe', 'actif')
  order by k.company_id, k.signed_at desc
),
prospects as (
  select distinct on (l.company_id)
         l.company_id, l.id as lead_id, l.status, l.source, l.owner_id, l.owner_name,
         l.next_follow_up_at, l.contact_first_name, l.contact_last_name, l.contact_phone
  from public.lead_overview l
  order by l.company_id, l.created_at desc
)
select
  c.id as company_id,
  c.name as company_name,
  c.address, c.postal_code, c.city,
  c.latitude, c.longitude, c.geocode_precision, c.geocoded_at,
  case when cl.company_id is not null then 'client' else 'prospect' end as kind,
  case when cl.company_id is not null then 'client' else p.status::text end as status,
  coalesce(cl.lead_id, p.lead_id) as lead_id,
  cl.contract_id,
  coalesce(cl.owner_id, p.owner_id) as owner_id,
  coalesce(cl.owner_name, p.owner_name) as owner_name,
  p.source,
  p.next_follow_up_at,
  p.contact_first_name, p.contact_last_name, p.contact_phone,
  cl.offer_code, cl.site_status,
  coalesce(cl.overdue_payments, 0) as overdue_payments
from public.companies c
left join clients cl on cl.company_id = c.id
left join prospects p on p.company_id = c.id
where cl.company_id is not null or p.company_id is not null;

grant select on public.map_points to authenticated;
revoke all on public.map_points from anon;
