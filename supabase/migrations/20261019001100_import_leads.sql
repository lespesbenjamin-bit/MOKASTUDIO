-- =============================================================================
-- Migration 0011 : import de prospects depuis un fichier (admin)
--
-- import_leads(rows, …, dry_run)
--   * rows : tableau JSON [{ company: {...}, contact: {...}, notes }, …]
--   * dry_run = true  → SIMULATION : chaque ligne passe par les mêmes contrôles
--                       que l'import réel (doublons, contraintes), puis tout est
--                       annulé. Le rapport est donc exact.
--   * dry_run = false → import réel ; une ligne en erreur n'empêche pas les autres.
-- Chaque ligne passe par create_lead : mêmes règles de doublons que la saisie.
-- L'application envoie les fichiers par paquets (≤ 200 lignes par appel).
-- =============================================================================

create or replace function public.import_leads(
  p_rows           jsonb,
  p_source         public.lead_source default 'prospection',
  p_owner_id       uuid default null,
  p_next_follow_up timestamptz default null,
  p_file_name      text default null,
  p_dry_run        boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row    jsonb;
  v_line   integer := 0;
  v_id     uuid;
  v_state  text;
  v_msg    text;
  v_report jsonb := '[]'::jsonb;
  v_ok     integer := 0;
  v_dup    integer := 0;
  v_err    integer := 0;
  v_note   text := 'Importé depuis ' || coalesce('« ' || nullif(btrim(p_file_name), '') || ' »', 'un fichier');
begin
  if not public.is_admin() then
    raise exception 'Import réservé aux administrateurs' using errcode = '42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Format de données invalide' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 500 then
    raise exception 'Trop de lignes dans un seul envoi (500 maximum)' using errcode = '22023';
  end if;
  if p_owner_id is not null and not exists (
       select 1 from public.profiles where id = p_owner_id and is_active and role in ('admin', 'commercial')) then
    raise exception 'Responsable invalide' using errcode = '22023';
  end if;

  begin
    for v_row in select value from jsonb_array_elements(p_rows) loop
      v_line := v_line + 1;
      begin
        v_id := public.create_lead(
          coalesce(v_row -> 'company', '{}'::jsonb),
          coalesce(v_row -> 'contact', '{}'::jsonb),
          p_source, p_owner_id,
          nullif(btrim(v_row ->> 'notes'), ''),
          p_next_follow_up,
          false);
        insert into public.lead_activities (lead_id, actor_id, kind, body)
        values (v_id, auth.uid(), 'note', v_note);
        v_ok := v_ok + 1;
        v_report := v_report || jsonb_build_object('line', v_line, 'status', 'importe');
      exception when others then
        get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
        if v_state = '23505' then
          v_dup := v_dup + 1;
          v_report := v_report || jsonb_build_object(
            'line', v_line, 'status', 'doublon',
            'message', case when v_msg like 'Doublon%' then v_msg
                            when v_msg like '%siren%' then 'Doublon : SIREN déjà présent'
                            when v_msg like '%leads_one_open%' then 'Doublon : prospect déjà en cours'
                            else 'Doublon' end);
        else
          v_err := v_err + 1;
          v_report := v_report || jsonb_build_object(
            'line', v_line, 'status', 'erreur',
            'message', case when v_state = '23514' then 'Valeur refusée (email, code postal ou SIREN)'
                            when v_state = '22023' then v_msg
                            else 'Erreur : ' || v_msg end);
        end if;
      end;
    end loop;

    if p_dry_run then
      -- Annule toutes les écritures de la simulation ; le rapport (variable) est conservé.
      raise exception '__simulation__' using errcode = 'P0001';
    end if;
  exception when sqlstate 'P0001' then
    if sqlerrm <> '__simulation__' then raise; end if;
  end;

  return jsonb_build_object(
    'dry_run', p_dry_run, 'total', v_line,
    'imported', v_ok, 'duplicates', v_dup, 'errors', v_err,
    'rows', v_report);
end;
$$;

revoke execute on function public.import_leads(jsonb, public.lead_source, uuid, timestamptz, text, boolean) from public, anon;
grant execute on function public.import_leads(jsonb, public.lead_source, uuid, timestamptz, text, boolean) to authenticated;
