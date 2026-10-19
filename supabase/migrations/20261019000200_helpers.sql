-- =============================================================================
-- Migration 0002 : fonctions utilitaires
--   * set_updated_at()      : horodatage automatique des modifications
--   * normalize_phone(text) : téléphone → format international chiffres seuls (33…)
--   * normalize_email(text) : email minuscule sans espaces
--   * normalize_domain(text): URL → domaine nu (sans http, www, chemin, port)
-- Les fonctions de normalisation sont IMMUTABLE pour servir de colonnes générées
-- et d'index : c'est la base de la détection des doublons.
-- =============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.normalize_phone(p text)
returns text
language plpgsql
immutable
as $$
declare
  d text;
begin
  if p is null then return null; end if;
  d := regexp_replace(p, '\D', '', 'g');          -- chiffres uniquement
  if d = '' then return null; end if;
  if left(d, 2) = '00' then d := substr(d, 3); end if;          -- 0033… → 33…
  if length(d) = 10 and left(d, 1) = '0' then d := '33' || substr(d, 2); end if; -- 06… → 336…
  if left(d, 3) = '330' and length(d) = 12 then d := '33' || substr(d, 4); end if; -- +33 (0)6…
  return d;
end;
$$;

create or replace function public.normalize_email(p text)
returns text
language sql
immutable
as $$
  select nullif(lower(btrim(p)), '');
$$;

create or replace function public.normalize_domain(p text)
returns text
language sql
immutable
as $$
  select nullif(
    regexp_replace(
      regexp_replace(
        regexp_replace(lower(btrim(coalesce(p, ''))), '^[a-z]+://', ''),  -- schéma
        '^www\.', ''),                                                    -- www.
      '[/:?#].*$', ''),                                                   -- chemin, port, query
    '');
$$;
