// Tests des indicateurs du tableau de bord (étape 5).
// Usage : npm run db:test-dashboard
import { createDb, as, asOwner, makeChecker } from './db-harness.mjs';

const db = await createDb({ log: false });
const { ok, rejects, eq, done } = makeChecker();
const U = { admin: 'a0000000-0000-0000-0000-000000000001', com: 'c0000000-0000-0000-0000-000000000001' };
await db.exec(`insert into auth.users values ('${U.admin}','a@m.t'),('${U.com}','c@m.t')`);
await asOwner(db, `insert into profiles (id, role, full_name, email, is_active) values
  ('${U.admin}','admin','Benjamin','a@m.t',true), ('${U.com}','commercial','Camille','c@m.t',true)`);

const q = async (who, sql, p) => (await as(db, who, sql, p)).rows;
const one = async (who, sql, p) => (await q(who, sql, p))[0];
const kpi = async (from, to) => (await one(U.admin, `select dashboard_kpis($1, $2) k`, [from, to])).k;

// Scénario : 3 prospects, 1 RDV, 1 perdu, 2 contrats en septembre (abonnement + vente directe)
const lead = async (name) => (await one(U.com, `select create_lead($1::jsonb) id`, [JSON.stringify({ name })])).id;
const L1 = await lead('Salon Léa'), L2 = await lead('Garage'), L3 = await lead('Pressing');
await q(U.com, `update leads set status='rdv_programme' where id=$1`, [L1]);
await q(U.com, `update leads set status='perdu', lost_reason='Budget' where id=$1`, [L3]);
const K1 = (await one(U.com, `select convert_lead_to_customer($1, 'abonnement', false, '2026-09-01', '2026-09-01') id`, [L1])).id;
const K2 = (await one(U.com, `select convert_lead_to_customer($1, 'vente_directe', false, '2026-09-10') id`, [L2])).id;
await q(U.admin, `select generate_monthly_payments('2026-09-01')`);
await q(U.admin, `select generate_monthly_payments('2026-10-01')`);
// Encaissements : septembre = 39 (mise en service) + 29 (sept) + 500 (vente) ; octobre = 29
await q(U.admin, `select set_payment_status(id, 'encaisse', '2026-09-05') from payments where contract_id=$1 and kind='mise_en_service'`, [K1]);
await q(U.admin, `select set_payment_status(id, 'encaisse', '2026-09-06') from payments where contract_id=$1 and period_month='2026-09-01'`, [K1]);
await q(U.admin, `select set_payment_status(id, 'encaisse', '2026-09-20') from payments where contract_id=$1`, [K2]);
await q(U.admin, `select set_payment_status(id, 'encaisse', '2026-10-03') from payments where contract_id=$1 and period_month='2026-10-01'`, [K1]);
// Les dates d'historique sont « maintenant » (octobre) : on les recale en septembre pour le test
await asOwner(db, `update lead_activities set occurred_at = '2026-09-15'`);

console.log('Indicateurs commerciaux (septembre 2026)');
let S;
await ok('calcul sans erreur', async () => { S = await kpi('2026-09-01', '2026-09-30'); });
await ok('qualifiés / RDV / gagnés / perdus', async () => {
  eq(S.leads_qualified, 2); eq(S.meetings, 1); eq(S.won, 2); eq(S.lost, 1);
});
await ok('taux de transformation = gagnés ÷ (gagnés + perdus) = 66,67 %', async () => eq(Number(S.conversion_rate_bps), 6667));
await ok('2 contrats signés, ventes par commercial', async () => {
  eq(S.contracts_signed, 2);
  eq(S.sales_by_owner[0].name, 'Camille'); eq(S.sales_by_owner[0].contracts, 2);
  eq(Number(S.sales_by_owner[0].value_cents), 3900 + 2900 * 12 + 50000);
});

console.log('\nIndicateurs financiers');
await ok('CA encaissé septembre = 39 + 29 + 500 = 568 €', async () => eq(Number(S.cash_in_cents), 56800));
await ok('CA encaissé octobre = 29 € (encaissement, pas signature)', async () =>
  eq(Number((await kpi('2026-10-01', '2026-10-31')).cash_in_cents), 2900));
await ok('MRR = 29 €, ARR = 348 €, 1 abonnement actif', async () => {
  eq(Number(S.mrr_cents), 2900); eq(Number(S.arr_cents), 34800); eq(S.active_subscriptions, 1);
});
await ok('CA signé non encaissé = engagement restant (12×29 + 39 − encaissé)', async () => {
  const O = await kpi('2026-10-01', '2026-10-31');
  eq(Number(O.signed_unpaid_cents), 3900 + 2900 * 12 - (3900 + 2900 + 2900));
});
await ok('provision 25 % du CA encaissé, présentée à part', async () => eq(Number(S.contributions_provision_cents), 14200));
await ok('trésorerie estimée = encaissé − commissions payées − frais − coûts − provision', async () => {
  const exp = Number(S.cash_in_cents) - Number(S.commissions_paid_cents) - Number(S.fixed_costs_cents)
    - Number(S.variable_costs_cents) - Number(S.expenses_cents) - Number(S.contributions_provision_cents);
  eq(Number(S.estimated_cash_cents), exp);
  eq(Number(S.fixed_costs_cents), Math.round(10000 * 30 / (365.25 / 12)));
});
await ok('commissions dues : tranches acquises (25 € + 90 €)', async () => eq(Number(S.commissions_due_cents), 2500 + 9000));
await ok('résiliation comptée dans la période et sortie du MRR', async () => {
  await q(U.admin, `select end_contract($1, 'resilie', '2026-10-15', 'Fermeture')`, [K1]);
  const O = await kpi('2026-10-01', '2026-10-31');
  eq(O.cancellations, 1); eq(Number(O.mrr_cents), 0);
  eq(Number((await kpi('2026-09-01', '2026-09-30')).mrr_cents), 2900); // l'historique reste juste
});

console.log('\nSéries mensuelles');
await ok('12 mois, encaissements et MRR par mois', async () => {
  const rows = await q(U.admin, `select * from dashboard_monthly('2026-10-19')`);
  eq(rows.length, 12);
  const sep = rows.find((r) => String(r.month).startsWith('2026-09') || new Date(r.month).getMonth() === 8);
  eq(Number(sep.cash_in_cents), 56800); eq(Number(sep.mrr_cents), 2900); eq(sep.contracts_signed, 2);
});

console.log('\nDroits');
await rejects('un commercial ne peut pas lire les indicateurs', () => q(U.com, `select dashboard_kpis('2026-09-01','2026-09-30')`));
await ok('un commercial obtient une série vide', async () => eq((await q(U.com, `select * from dashboard_monthly()`)).length, 0));
await rejects('période inversée', () => kpi('2026-10-01', '2026-09-01'));
await ok('l\'admin enregistre un scénario (fusion des hypothèses)', async () => {
  const id = (await one(U.admin, `select id from financial_scenarios where kind='central'`)).id;
  await q(U.admin, `select save_scenario($1, '{"new_subscriptions_per_month": 7}')`, [id]);
  const a = (await one(U.admin, `select assumptions a from financial_scenarios where id=$1`, [id])).a;
  eq(a.new_subscriptions_per_month, 7); eq(a.subscription_price_cents, 2900);
});

process.exit(done() ? 1 : 0);
