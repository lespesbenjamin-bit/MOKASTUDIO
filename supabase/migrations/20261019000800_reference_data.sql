-- =============================================================================
-- Migration 0008 : données de RÉFÉRENCE (paramétrage, pas des données fictives)
-- Tarifs, grille de commissions v1, hypothèses de gestion, 3 scénarios.
-- Tout est modifiable ensuite par l'administrateur.
-- =============================================================================

insert into public.app_settings (id) values (true);

insert into public.offers (code, label, description, monthly_price_cents, setup_fee_cents, one_shot_price_cents, commitment_months) values
  ('abonnement',      'Abonnement site',  'Site clé en main, engagement initial 12 mois',                2900, 3900,     0, 12),
  ('vente_directe',   'Vente directe',    'Site vendu, une modification trimestrielle selon contrat',      0,    0, 50000,  0),
  ('option_planning', 'Option planning',  'Module de prise de rendez-vous en ligne',                     2000,    0,     0,  0);

-- Grille v1. Abonnement : 50 % au 1er encaissement, 50 % après 3 mensualités.
-- Vente directe : 100 % au 1er encaissement. Option planning : 0 € (configurable).
insert into public.commission_rules
  (beneficiary_role, offer_code, amount_cents, tranche1_bps, tranche2_bps, tranche2_after_payments) values
  ('apporteur',  'abonnement',      3000,  5000, 5000, 3),
  ('apporteur',  'vente_directe',   5000, 10000,    0, null),
  ('apporteur',  'option_planning',    0,  5000, 5000, 3),
  ('commercial', 'abonnement',      5000,  5000, 5000, 3),
  ('commercial', 'vente_directe',   9000, 10000,    0, null),
  ('commercial', 'option_planning',    0,  5000, 5000, 3);

-- Scénarios : « central » = hypothèses du cahier des charges.
-- « prudent » et « ambitieux » = PROPOSITIONS à valider par l'admin.
with base as (
  select jsonb_build_object(
    'subscription_price_cents',    2900,
    'setup_fee_cents',             3900,
    'direct_sale_price_cents',     50000,
    'planning_attach_rate_bps',    0,
    'planning_price_cents',        2000,
    'variable_cost_per_sub_cents', 500,
    'fixed_costs_monthly_cents',   10000,
    'salary_costs_monthly_cents',  0,
    'contributions_provision_bps', 2500
  ) as a
)
insert into public.financial_scenarios (name, kind, start_month, assumptions, is_reference)
select v.name, v.kind::public.scenario_kind, date_trunc('month', now())::date,
       base.a || v.extra, true
from base, (values
  ('Prudent',   'prudent',   '{"new_subscriptions_per_month": 3, "direct_sales_per_month": 0.5, "renewal_rate_bps": 8000}'::jsonb),
  ('Central',   'central',   '{"new_subscriptions_per_month": 5, "direct_sales_per_month": 1,   "renewal_rate_bps": 10000}'::jsonb),
  ('Ambitieux', 'ambitieux', '{"new_subscriptions_per_month": 8, "direct_sales_per_month": 2,   "renewal_rate_bps": 10000}'::jsonb)
) as v(name, kind, extra);
