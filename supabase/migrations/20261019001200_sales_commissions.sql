-- =============================================================================
-- Migration 0012 : ventes — conversion en client, contrats, abonnements,
-- paiements, moteur de commissions, paramétrage.
--
-- Règles :
--   * Le contrat COPIE les prix du catalogue à la signature (+ instantané JSON).
--   * Commissions créées « prévisionnelles » à la signature, montant copié de la
--     règle courante (aucun recalcul si la grille change ensuite).
--   * Tranche 1 acquise au 1er encaissement (quel qu'il soit, frais de mise en
--     service compris) ; tranche 2 acquise à la N-ième mensualité encaissée.
--   * Contrat annulé / résilié : les tranches encore prévisionnelles sont annulées ;
--     les tranches acquises ne sont pas reprises (décision validée).
--   * Commission commerciale : seulement si le responsable est un commercial.
-- =============================================================================

create sequence if not exists public.contract_ref_seq;

-- -----------------------------------------------------------------------------
-- 1. Génération des commissions d'un contrat
-- -----------------------------------------------------------------------------
create or replace function public._create_commissions(p_contract_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_k      public.contracts%rowtype;
  v_cu     public.customers%rowtype;
  v_ben    record;
  v_code   public.offer_code;
  v_rule   public.commission_rules%rowtype;
  v_t1     bigint;
  v_n      integer := 0;
begin
  select * into v_k from public.contracts where id = p_contract_id;
  select * into v_cu from public.customers where id = v_k.customer_id;

  for v_ben in
    select p.id, 'commercial'::public.beneficiary_role as role
      from public.profiles p where p.id = v_cu.owner_id and p.role = 'commercial'
    union all
    select p.id, 'apporteur'::public.beneficiary_role
      from public.profiles p where p.id = v_cu.referrer_id and p.role = 'apporteur'
  loop
    foreach v_code in array
      case when v_k.with_planning_option
           then array[v_k.offer_code, 'option_planning'::public.offer_code]
           else array[v_k.offer_code] end
    loop
      select * into v_rule from public.commission_rules
       where beneficiary_role = v_ben.role and offer_code = v_code and valid_to is null;
      continue when not found or v_rule.amount_cents = 0;

      v_t1 := (v_rule.amount_cents * v_rule.tranche1_bps) / 10000;  -- arrondi inférieur, le reste va en tranche 2
      insert into public.commissions (contract_id, rule_id, beneficiary_id, beneficiary_role, offer_code,
                                      tranche, amount_cents, trigger_kind, required_payments)
      values (v_k.id, v_rule.id, v_ben.id, v_ben.role, v_code, 1, v_t1, 'premier_encaissement', null)
      on conflict do nothing;
      v_n := v_n + 1;

      if v_rule.tranche2_bps > 0 then
        insert into public.commissions (contract_id, rule_id, beneficiary_id, beneficiary_role, offer_code,
                                        tranche, amount_cents, trigger_kind, required_payments)
        values (v_k.id, v_rule.id, v_ben.id, v_ben.role, v_code, 2, v_rule.amount_cents - v_t1,
                'n_mensualites', v_rule.tranche2_after_payments)
        on conflict do nothing;
        v_n := v_n + 1;
      end if;
    end loop;
  end loop;
  return v_n;
end;
$$;
revoke execute on function public._create_commissions(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Conversion d'un prospect en client (commercial responsable ou admin)
-- -----------------------------------------------------------------------------
create or replace function public.convert_lead_to_customer(
  p_lead_id              uuid,
  p_offer_code           public.offer_code,
  p_with_planning        boolean default false,
  p_signed_at            date default current_date,
  p_activated_at         date default null,
  p_monthly_price_cents  bigint default null,
  p_setup_fee_cents      bigint default null,
  p_one_shot_price_cents bigint default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role     public.user_role := public.current_app_role();
  v_lead     public.leads%rowtype;
  v_offer    public.offers%rowtype;
  v_planning public.offers%rowtype;
  v_customer uuid;
  v_contract uuid;
  v_monthly  bigint := 0;
  v_setup    bigint := 0;
  v_one      bigint := 0;
  v_plan     bigint := 0;
  v_ref      text;
  v_start    date;
begin
  if v_role is null or v_role not in ('admin', 'commercial') then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found or (v_role = 'commercial' and v_lead.owner_id is distinct from auth.uid()) then
    raise exception 'Prospect introuvable' using errcode = '42501';
  end if;
  if v_lead.status = 'perdu' then
    raise exception 'Ce prospect est marqué perdu : rouvrez-le avant de le convertir' using errcode = '22023';
  end if;
  if p_offer_code = 'option_planning' then
    raise exception 'Choisissez l''abonnement ou la vente directe' using errcode = '22023';
  end if;
  if v_role <> 'admin' and coalesce(p_monthly_price_cents, p_setup_fee_cents, p_one_shot_price_cents) is not null then
    raise exception 'Seul l''administrateur peut modifier un prix' using errcode = '42501';
  end if;
  if p_signed_at is null or p_signed_at > current_date + 1 then
    raise exception 'Date de signature invalide' using errcode = '22023';
  end if;
  if exists (select 1 from public.contracts k join public.customers c on c.id = k.customer_id
             where c.lead_id = p_lead_id and k.status not in ('annule')) then
    raise exception 'Ce prospect a déjà été converti en client' using errcode = '23505';
  end if;

  select * into v_offer from public.offers where code = p_offer_code and is_active;
  if not found then raise exception 'Offre indisponible' using errcode = '22023'; end if;

  if p_offer_code = 'abonnement' then
    v_monthly := coalesce(p_monthly_price_cents, v_offer.monthly_price_cents);
    v_setup   := coalesce(p_setup_fee_cents, v_offer.setup_fee_cents);
  else
    v_one     := coalesce(p_one_shot_price_cents, v_offer.one_shot_price_cents);
    v_setup   := coalesce(p_setup_fee_cents, v_offer.setup_fee_cents);
  end if;
  if p_with_planning then
    select * into v_planning from public.offers where code = 'option_planning' and is_active;
    if not found then raise exception 'Option planning indisponible' using errcode = '22023'; end if;
    v_plan := v_planning.monthly_price_cents;
  end if;

  -- Client : réutilisé si l'entreprise l'est déjà
  select id into v_customer from public.customers where company_id = v_lead.company_id;
  if v_customer is null then
    insert into public.customers (company_id, lead_id, owner_id, referrer_id, converted_by)
    values (v_lead.company_id, v_lead.id, v_lead.owner_id, v_lead.referrer_id, auth.uid())
    returning id into v_customer;
  end if;

  v_ref := 'MOKA-' || to_char(p_signed_at, 'YYYY') || '-' || lpad(nextval('public.contract_ref_seq')::text, 4, '0');
  v_start := coalesce(p_activated_at, p_signed_at);

  insert into public.contracts (
    reference, customer_id, offer_code, status,
    monthly_price_cents, setup_fee_cents, one_shot_price_cents,
    with_planning_option, planning_monthly_cents, offer_snapshot,
    signed_at, activated_at, commitment_months, renewal, created_by)
  values (
    v_ref, v_customer, p_offer_code, (case when p_activated_at is not null then 'actif' else 'signe' end)::public.contract_status,
    v_monthly, v_setup, v_one,
    p_with_planning, v_plan,
    jsonb_build_object('offer', to_jsonb(v_offer),
                       'planning', case when p_with_planning then to_jsonb(v_planning) end,
                       'captured_at', now()),
    p_signed_at, p_activated_at, v_offer.commitment_months,
    case when p_offer_code = 'abonnement' then 'tacite' else 'aucun' end::public.renewal_mode,
    auth.uid())
  returning id into v_contract;

  if v_monthly + v_plan > 0 then
    insert into public.subscriptions (contract_id, monthly_amount_cents, started_on, next_due_on)
    values (v_contract, v_monthly + v_plan, v_start, date_trunc('month', v_start)::date);
  end if;

  -- Montants ponctuels à encaisser
  if v_setup > 0 then
    insert into public.payments (contract_id, kind, amount_cents, due_on, created_by)
    values (v_contract, 'mise_en_service', v_setup, p_signed_at, auth.uid());
  end if;
  if v_one > 0 then
    insert into public.payments (contract_id, kind, amount_cents, due_on, created_by)
    values (v_contract, 'vente_directe', v_one, p_signed_at, auth.uid());
  end if;

  insert into public.deals (lead_id, owner_id, offer_code, with_planning_option, status, closed_at)
  values (v_lead.id, v_lead.owner_id, p_offer_code, p_with_planning, 'gagne', now());

  if v_lead.status <> 'gagne' then
    update public.leads set status = 'gagne' where id = v_lead.id;
  end if;
  insert into public.lead_activities (lead_id, actor_id, kind, body)
  values (v_lead.id, auth.uid(), 'conversion', 'Contrat ' || v_ref);

  perform public._create_commissions(v_contract);
  return v_contract;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Acquisition automatique des commissions à l'encaissement
-- -----------------------------------------------------------------------------
create or replace function public.refresh_contract_commissions(p_contract_id uuid, p_payment_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_any     boolean;
  v_monthly integer;
  v_n       integer;
begin
  select count(*) > 0,
         count(*) filter (where kind = 'mensualite')
    into v_any, v_monthly
    from public.payments
   where contract_id = p_contract_id and status = 'encaisse';

  update public.commissions
     set status = 'acquise', acquired_at = now(), trigger_payment_id = p_payment_id
   where contract_id = p_contract_id
     and status = 'previsionnelle'
     and ((trigger_kind = 'premier_encaissement' and v_any)
       or (trigger_kind = 'n_mensualites' and v_monthly >= required_payments));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function public.refresh_contract_commissions(uuid, uuid) from public, anon, authenticated;

create or replace function public.payments_after_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'encaisse' and (tg_op = 'INSERT' or old.status is distinct from 'encaisse') then
    perform public.refresh_contract_commissions(new.contract_id, new.id);
  end if;
  return new;
end;
$$;
create trigger payments_after_write after insert or update of status on public.payments
  for each row execute function public.payments_after_write();

-- Paiement « encaissé » : date d'encaissement renseignée automatiquement
create or replace function public.payments_before_write()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('encaisse', 'rembourse') and new.paid_at is null then new.paid_at := now(); end if;
  if new.status in ('en_attente', 'echoue') then new.paid_at := null; end if;
  return new;
end;
$$;
create trigger payments_a_before_write before insert or update on public.payments
  for each row execute function public.payments_before_write();

-- -----------------------------------------------------------------------------
-- 4. Cycle de vie du contrat
-- -----------------------------------------------------------------------------
-- Site mis en ligne sans date d'activation → activation automatique ce jour.
create or replace function public.contracts_after_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.site_status = 'en_ligne' and new.activated_at is null and new.status = 'signe' then
    update public.contracts set activated_at = greatest(current_date, new.signed_at), status = 'actif' where id = new.id;
    update public.subscriptions set started_on = greatest(current_date, new.signed_at),
                                    next_due_on = date_trunc('month', greatest(current_date, new.signed_at))::date
     where contract_id = new.id and status = 'active';
  end if;

  if new.status in ('annule', 'resilie') and old.status is distinct from new.status then
    update public.commissions
       set status = 'annulee', cancelled_at = now(),
           cancel_reason = case new.status when 'annule' then 'Contrat annulé' else 'Contrat résilié avant acquisition' end
     where contract_id = new.id and status = 'previsionnelle';
    update public.subscriptions
       set status = 'resiliee', cancelled_on = coalesce(new.terminated_at, current_date),
           cancel_reason = new.termination_reason
     where contract_id = new.id and status <> 'resiliee';
    update public.payments set status = 'echoue'
     where contract_id = new.id and status = 'en_attente'
       and due_on > coalesce(new.terminated_at, current_date);
  end if;
  return new;
end;
$$;
create trigger contracts_after_update after update on public.contracts
  for each row execute function public.contracts_after_update();

create or replace function public.activate_contract(p_contract_id uuid, p_date date default current_date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_k public.contracts%rowtype;
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs' using errcode = '42501'; end if;
  select * into v_k from public.contracts where id = p_contract_id for update;
  if not found then raise exception 'Contrat introuvable'; end if;
  if v_k.status not in ('signe', 'actif') then raise exception 'Contrat % : activation impossible', v_k.status using errcode = '22023'; end if;
  if p_date < v_k.signed_at then raise exception 'L''activation ne peut pas précéder la signature' using errcode = '22023'; end if;
  update public.contracts set activated_at = p_date, status = 'actif' where id = p_contract_id;
  update public.subscriptions set started_on = p_date, next_due_on = date_trunc('month', p_date)::date
   where contract_id = p_contract_id and status = 'active';
end;
$$;

-- Résiliation (fin de service) ou annulation (contrat jamais exécuté).
create or replace function public.end_contract(
  p_contract_id uuid,
  p_mode        public.contract_status,
  p_date        date default current_date,
  p_reason      text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs' using errcode = '42501'; end if;
  if p_mode not in ('resilie', 'annule') then raise exception 'Mode invalide' using errcode = '22023'; end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'Le motif est obligatoire' using errcode = '22023'; end if;
  update public.contracts
     set status = p_mode, terminated_at = p_date, termination_reason = btrim(p_reason)
   where id = p_contract_id and status in ('signe', 'actif');
  if not found then raise exception 'Contrat introuvable ou déjà terminé' using errcode = '22023'; end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Échéances mensuelles des abonnements
-- -----------------------------------------------------------------------------
create or replace function public.generate_monthly_payments(p_month date default current_date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_end   date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_n     integer;
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs' using errcode = '42501'; end if;

  insert into public.payments (contract_id, subscription_id, kind, amount_cents, due_on, period_month, created_by)
  select s.contract_id, s.id, 'mensualite', s.monthly_amount_cents,
         greatest(v_month, s.started_on), v_month, auth.uid()
    from public.subscriptions s
    join public.contracts k on k.id = s.contract_id
   where s.status = 'active'
     and k.status in ('signe', 'actif')
     and s.started_on <= v_end
  on conflict (subscription_id, period_month) where kind = 'mensualite' do nothing;
  get diagnostics v_n = row_count;

  update public.subscriptions s
     set next_due_on = (v_month + interval '1 month')::date
   where s.status = 'active' and s.started_on <= v_end
     and (s.next_due_on is null or s.next_due_on <= v_month);
  return v_n;
end;
$$;

-- Encaissement (ou annulation d'encaissement) d'un paiement
create or replace function public.set_payment_status(
  p_payment_id uuid,
  p_status     public.payment_status,
  p_paid_at    date default null,
  p_method     text default null,
  p_reference  text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs' using errcode = '42501'; end if;
  update public.payments
     set status = p_status,
         paid_at = case when p_status in ('encaisse', 'rembourse')
                        then coalesce(p_paid_at::timestamptz, paid_at, now()) end,
         method = coalesce(nullif(btrim(p_method), ''), method),
         external_ref = coalesce(nullif(btrim(p_reference), ''), external_ref)
   where id = p_payment_id;
  if not found then raise exception 'Paiement introuvable'; end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Commissions : facturation, paiement (par lot), annulation
-- -----------------------------------------------------------------------------
create or replace function public.update_commissions(
  p_ids       uuid[],
  p_status    public.commission_status,
  p_reference text default null,
  p_reason    text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer;
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs' using errcode = '42501'; end if;
  if p_status not in ('facturee', 'payee', 'annulee') then raise exception 'Statut invalide' using errcode = '22023'; end if;
  if p_status = 'payee' and nullif(btrim(p_reference), '') is null then
    raise exception 'La référence du virement est obligatoire' using errcode = '22023';
  end if;
  if p_status = 'annulee' and nullif(btrim(p_reason), '') is null then
    raise exception 'Le motif d''annulation est obligatoire' using errcode = '22023';
  end if;

  -- Tout ou rien : une seule ligne non éligible annule l'opération entière
  -- (le garde-fou commissions_guard refuse les transitions interdites).
  update public.commissions
     set status        = p_status,
         invoiced_at   = case when p_status = 'facturee' then now() else invoiced_at end,
         invoice_ref   = case when p_status = 'facturee' then coalesce(nullif(btrim(p_reference), ''), invoice_ref) else invoice_ref end,
         paid_at       = case when p_status = 'payee' then now() else paid_at end,
         payout_ref    = case when p_status = 'payee' then btrim(p_reference) else payout_ref end,
         cancelled_at  = case when p_status = 'annulee' then now() else cancelled_at end,
         cancel_reason = case when p_status = 'annulee' then btrim(p_reason) else cancel_reason end
   where id = any(p_ids);
  get diagnostics v_n = row_count;
  if v_n <> coalesce(array_length(p_ids, 1), 0) then
    raise exception 'Certaines commissions sont introuvables' using errcode = '22023';
  end if;
  return v_n;
end;
$$;

-- Nouvelle version d'une règle (l'ancienne est clôturée, rien n'est recalculé)
create or replace function public.publish_commission_rule(
  p_role         public.beneficiary_role,
  p_offer        public.offer_code,
  p_amount_cents bigint,
  p_tranche1_bps integer,
  p_tranche2_bps integer,
  p_after        integer)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs' using errcode = '42501'; end if;
  update public.commission_rules set valid_to = now()
   where beneficiary_role = p_role and offer_code = p_offer and valid_to is null;
  insert into public.commission_rules (beneficiary_role, offer_code, amount_cents, tranche1_bps, tranche2_bps,
                                       tranche2_after_payments, valid_from, created_by)
  values (p_role, p_offer, p_amount_cents, p_tranche1_bps, p_tranche2_bps,
          case when p_tranche2_bps > 0 then p_after end, now(), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Vues de lecture (RLS de l'utilisateur appliquée)
-- -----------------------------------------------------------------------------
create or replace view public.contract_overview
with (security_invoker = true)
as
select
  k.id, k.reference, k.customer_id, k.offer_code, k.status,
  k.monthly_price_cents, k.setup_fee_cents, k.one_shot_price_cents,
  k.with_planning_option, k.planning_monthly_cents,
  k.signed_at, k.activated_at, k.commitment_months, k.commitment_end_at, k.renewal,
  k.terminated_at, k.termination_reason, k.site_status, k.site_url, k.created_at,
  cu.company_id, cu.lead_id, cu.owner_id, cu.referrer_id,
  c.name  as company_name, c.city,
  o.full_name as owner_name,
  s.id as subscription_id, s.status as subscription_status,
  s.monthly_amount_cents, s.next_due_on,
  coalesce((select sum(p.amount_cents) from public.payments p
            where p.contract_id = k.id and p.status = 'encaisse'), 0)::bigint as paid_cents,
  coalesce((select sum(p.amount_cents) from public.payments p
            where p.contract_id = k.id and p.status = 'en_attente'), 0)::bigint as pending_cents,
  (select count(*) from public.payments p
    where p.contract_id = k.id and p.status = 'en_attente' and p.due_on < current_date)::integer as overdue_payments
from public.contracts k
join public.customers cu on cu.id = k.customer_id
join public.companies c  on c.id = cu.company_id
left join public.profiles o on o.id = cu.owner_id
left join public.subscriptions s on s.contract_id = k.id;

create or replace view public.payment_overview
with (security_invoker = true)
as
select
  p.id, p.contract_id, p.subscription_id, p.kind, p.amount_cents, p.due_on, p.period_month,
  p.status, p.paid_at, p.method, p.external_ref, p.created_at,
  k.reference as contract_reference, cu.id as customer_id, c.name as company_name
from public.payments p
join public.contracts k  on k.id = p.contract_id
join public.customers cu on cu.id = k.customer_id
join public.companies c  on c.id = cu.company_id;

create or replace view public.commission_overview
with (security_invoker = true)
as
select
  m.id, m.contract_id, m.rule_id, m.beneficiary_id, m.beneficiary_role, m.offer_code, m.tranche,
  m.amount_cents, m.trigger_kind, m.required_payments, m.status, m.acquired_at,
  m.invoiced_at, m.invoice_ref, m.paid_at, m.payout_ref, m.cancelled_at, m.cancel_reason, m.created_at,
  b.full_name as beneficiary_name,
  k.reference as contract_reference, k.signed_at, cu.id as customer_id, c.name as company_name
from public.commissions m
join public.contracts k  on k.id = m.contract_id
join public.customers cu on cu.id = k.customer_id
join public.companies c  on c.id = cu.company_id
left join public.profiles b on b.id = m.beneficiary_id;

grant select on public.contract_overview, public.payment_overview, public.commission_overview to authenticated;
revoke all on public.contract_overview, public.payment_overview, public.commission_overview from anon;

-- Les apporteurs voient leurs commissions, mais pas les contrats : la vue
-- commission_overview joint contracts (RLS) → on leur expose une fonction dédiée.
create or replace function public.my_commissions()
returns table (
  id uuid, offer_code public.offer_code, tranche smallint, amount_cents bigint,
  status public.commission_status, acquired_at timestamptz, paid_at timestamptz,
  company_name text, signed_at date, trigger_kind public.commission_trigger, required_payments integer)
language sql stable security definer set search_path = public
as $$
  select m.id, m.offer_code, m.tranche, m.amount_cents, m.status, m.acquired_at, m.paid_at,
         c.name, k.signed_at, m.trigger_kind, m.required_payments
  from public.commissions m
  join public.contracts k  on k.id = m.contract_id
  join public.customers cu on cu.id = k.customer_id
  join public.companies c  on c.id = cu.company_id
  where m.beneficiary_id = auth.uid() and public.current_app_role() is not null
  order by k.signed_at desc, m.tranche;
$$;
