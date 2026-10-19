// Tests ventes, contrats, paiements et commissions (étape 4).
// Usage : npm run db:test-sales
import { createDb, as, asOwner, makeChecker } from './db-harness.mjs';

const db = await createDb({ log: false });
const { ok, rejects, eq, done } = makeChecker();
const U = {
  admin: 'a0000000-0000-0000-0000-000000000001',
  com: 'c0000000-0000-0000-0000-000000000001',
  com2: 'c0000000-0000-0000-0000-000000000002',
  app: 'e0000000-0000-0000-0000-000000000001',
};
await db.exec(`insert into auth.users values ('${U.admin}','a@m.t'),('${U.com}','c@m.t'),('${U.com2}','c2@m.t'),('${U.app}','e@m.t')`);
await asOwner(db, `insert into profiles (id, role, full_name, email, is_active) values
  ('${U.admin}','admin','Benjamin','a@m.t',true), ('${U.com}','commercial','Camille','c@m.t',true),
  ('${U.com2}','commercial','Hugo','c2@m.t',true), ('${U.app}','apporteur','Agathe','e@m.t',true)`);

const q = async (who, sql, p) => (await as(db, who, sql, p)).rows;
const one = async (who, sql, p) => (await q(who, sql, p))[0];
const raw = async (sql, p) => (await db.query(sql, p)).rows;

// Prospect apporté par Agathe, attribué à Camille
const L1 = (await one(U.app, `select submit_referral('{"name":"Salon Léa"}', '{"phone":"0612345678"}') id`)).id;
await q(U.admin, `update leads set owner_id = $1 where id = $2`, [U.com, L1]);
// Prospect direct de Camille (vente directe + planning)
const L2 = (await one(U.com, `select create_lead('{"name":"Garage du Canal"}') id`)).id;
// Prospect de Hugo
const L3 = (await one(U.com2, `select create_lead('{"name":"Pressing"}') id`)).id;

console.log('Conversion en client');
let K1;
await ok('le commercial convertit son prospect (abonnement)', async () => {
  K1 = (await one(U.com, `select convert_lead_to_customer($1, 'abonnement', false, '2026-10-01') id`, [L1])).id;
});
await ok('prix figés depuis le catalogue (29 € / 39 €), engagement 12 mois', async () => {
  const k = (await raw(`select monthly_price_cents m, setup_fee_cents s, commitment_months c, reference r, status from contracts where id=$1`, [K1]))[0];
  eq(Number(k.m), 2900); eq(Number(k.s), 3900); eq(k.c, 12); eq(k.status, 'signe');
  if (!/^MOKA-2026-\d{4}$/.test(k.r)) throw new Error(k.r);
});
await ok('abonnement de 29 €/mois créé, frais de mise en service à encaisser', async () => {
  eq(Number((await raw(`select monthly_amount_cents a from subscriptions where contract_id=$1`, [K1]))[0].a), 2900);
  eq((await raw(`select kind from payments where contract_id=$1`, [K1])).map((r) => r.kind).join(), 'mise_en_service');
});
await ok('prospect passé « gagné », conversion dans l\'historique', async () => {
  eq((await raw(`select status from leads where id=$1`, [L1]))[0].status, 'gagne');
  const t = await q(U.com, `select kind, body from lead_timeline($1) where kind='conversion'`, [L1]);
  if (!t[0]?.body?.startsWith('Contrat MOKA-')) throw new Error('absent');
});
await ok('commissions prévisionnelles : commercial 25+25 €, apporteur 15+15 €', async () => {
  const r = await raw(`select beneficiary_role r, tranche t, amount_cents a, trigger_kind k, required_payments n, status from commissions where contract_id=$1 order by r, t`, [K1]);
  eq(r.map((x) => `${x.r}:${x.t}:${x.a}:${x.k}:${x.n ?? '-'}:${x.status}`).join(' '),
    'commercial:1:2500:premier_encaissement:-:previsionnelle commercial:2:2500:n_mensualites:3:previsionnelle apporteur:1:1500:premier_encaissement:-:previsionnelle apporteur:2:1500:n_mensualites:3:previsionnelle');
});
await rejects('double conversion du même prospect', () => q(U.com, `select convert_lead_to_customer($1, 'abonnement')`, [L1]));
await rejects('un commercial ne peut pas convertir le prospect d\'un collègue', () => q(U.com, `select convert_lead_to_customer($1, 'abonnement')`, [L3]));
await rejects('un commercial ne peut pas modifier le prix', () => q(U.com, `select convert_lead_to_customer($1, 'abonnement', false, current_date, null, 1000)`, [L2]));
await rejects('un apporteur ne peut pas convertir', () => q(U.app, `select convert_lead_to_customer($1, 'abonnement')`, [L2]));

let K2;
await ok('vente directe 500 € + option planning 20 €/mois', async () => {
  K2 = (await one(U.com, `select convert_lead_to_customer($1, 'vente_directe', true, '2026-10-05', '2026-10-10') id`, [L2])).id;
  const k = (await raw(`select one_shot_price_cents o, planning_monthly_cents p, status, renewal from contracts where id=$1`, [K2]))[0];
  eq(Number(k.o), 50000); eq(Number(k.p), 2000); eq(k.status, 'actif'); eq(k.renewal, 'aucun');
  eq(Number((await raw(`select monthly_amount_cents a from subscriptions where contract_id=$1`, [K2]))[0].a), 2000);
});
await ok('vente directe : commission commerciale 90 € en une tranche, option planning à 0 € = aucune ligne', async () => {
  const r = await raw(`select offer_code o, tranche t, amount_cents a from commissions where contract_id=$1`, [K2]);
  eq(r.length, 1); eq(r[0].o, 'vente_directe'); eq(Number(r[0].a), 9000);
});
await ok('l\'admin peut appliquer un prix négocié', async () => {
  const L4 = (await one(U.admin, `select create_lead('{"name":"Fleuriste"}') id`)).id;
  const id = (await one(U.admin, `select convert_lead_to_customer($1, 'abonnement', false, current_date, null, 2500, 0) id`, [L4])).id;
  const k = (await raw(`select monthly_price_cents m, setup_fee_cents s from contracts where id=$1`, [id]))[0];
  eq(Number(k.m), 2500); eq(Number(k.s), 0);
  eq((await raw(`select count(*)::int c from commissions where contract_id=$1`, [id]))[0].c, 0); // responsable = admin → pas de commission commerciale
});

console.log('\nPrix catalogue et grille modifiés après signature');
await ok('changer le catalogue et la grille ne touche pas l\'existant', async () => {
  await q(U.admin, `update offers set monthly_price_cents = 3500 where code='abonnement'`);
  await q(U.admin, `select publish_commission_rule('commercial','abonnement',8000,5000,5000,3)`);
  eq(Number((await raw(`select monthly_price_cents m from contracts where id=$1`, [K1]))[0].m), 2900);
  eq((await raw(`select sum(amount_cents)::int s from commissions where contract_id=$1 and beneficiary_role='commercial'`, [K1]))[0].s, 5000);
});
await ok('l\'ancienne règle est clôturée, la nouvelle est seule courante', async () => {
  eq((await raw(`select count(*)::int c from commission_rules where beneficiary_role='commercial' and offer_code='abonnement' and valid_to is null`))[0].c, 1);
  eq((await raw(`select count(*)::int c from commission_rules where beneficiary_role='commercial' and offer_code='abonnement'`))[0].c, 2);
});
await rejects('un commercial ne peut pas publier de règle', () => q(U.com, `select publish_commission_rule('commercial','abonnement',99999,10000,0,null)`));

console.log('\nEncaissements et acquisition des commissions');
const pay = async (kind) => (await raw(`select id from payments where contract_id=$1 and kind=$2 and status='en_attente' order by due_on limit 1`, [K1, kind]))[0].id;
await ok('1er encaissement (mise en service) → tranches 1 acquises', async () => {
  await q(U.admin, `select set_payment_status($1, 'encaisse', '2026-10-02', 'virement', 'VIR-001')`, [await pay('mise_en_service')]);
  const r = await raw(`select tranche t, status from commissions where contract_id=$1 order by beneficiary_role, tranche`, [K1]);
  eq(r.map((x) => `${x.t}:${x.status}`).join(' '), '1:acquise 2:previsionnelle 1:acquise 2:previsionnelle');
});
await ok('génération des mensualités : une par mois, sans doublon', async () => {
  for (const m of ['2026-10-01', '2026-11-01', '2026-12-01']) await q(U.admin, `select generate_monthly_payments($1)`, [m]);
  const again = (await one(U.admin, `select generate_monthly_payments('2026-12-01') n`)).n;
  eq(again, 0);
  eq((await raw(`select count(*)::int c from payments where contract_id=$1 and kind='mensualite'`, [K1]))[0].c, 3);
});
await ok('2 mensualités encaissées → tranche 2 toujours prévisionnelle', async () => {
  await q(U.admin, `select set_payment_status($1, 'encaisse')`, [await pay('mensualite')]);
  await q(U.admin, `select set_payment_status($1, 'encaisse')`, [await pay('mensualite')]);
  eq((await raw(`select count(*)::int c from commissions where contract_id=$1 and tranche=2 and status='previsionnelle'`, [K1]))[0].c, 2);
});
await ok('3ᵉ mensualité encaissée → tranches 2 acquises', async () => {
  await q(U.admin, `select set_payment_status($1, 'encaisse')`, [await pay('mensualite')]);
  eq((await raw(`select count(*)::int c from commissions where contract_id=$1 and status='acquise'`, [K1]))[0].c, 4);
});
await rejects('un commercial ne peut pas encaisser', async () => {
  const id = (await raw(`select id from payments where contract_id=$1 limit 1`, [K2]))[0].id;
  await q(U.com, `select set_payment_status($1, 'encaisse')`, [id]);
});

console.log('\nPaiement des commissions');
const ids = async (role) => (await raw(`select id from commissions where contract_id=$1 and beneficiary_role=$2 and status='acquise' order by tranche`, [K1, role])).map((r) => r.id);
await rejects('payer sans référence de virement', async () => q(U.admin, `select update_commissions($1::uuid[], 'payee')`, [await ids('commercial')]));
await ok('apporteur : facturée puis payée par lot', async () => {
  const a = await ids('apporteur');
  await q(U.admin, `select update_commissions($1::uuid[], 'facturee', 'FAC-AGATHE-01')`, [a]);
  eq((await one(U.admin, `select update_commissions($1::uuid[], 'payee', 'VIR-COM-2026-11') n`, [a])).n, 2);
});
await rejects('payer une seconde fois le même lot', async () => {
  const a = (await raw(`select id from commissions where contract_id=$1 and beneficiary_role='apporteur'`, [K1])).map((r) => r.id);
  await q(U.admin, `select update_commissions($1::uuid[], 'payee', 'VIR-BIS')`, [a]);
});
await rejects('lot mixte (une déjà payée) : refus total, rien n\'est modifié', async () => {
  const mixed = (await raw(`select id from commissions where contract_id=$1 and status in ('acquise','payee')`, [K1])).map((r) => r.id);
  try { await q(U.admin, `select update_commissions($1::uuid[], 'payee', 'VIR-X')`, [mixed]); }
  finally { eq((await raw(`select count(*)::int c from commissions where payout_ref='VIR-X'`))[0].c, 0); }
});

console.log('\nVisibilité');
await ok('commercial : voit ses commissions via la vue, pas celles de l\'apporteur', async () => {
  const r = await q(U.com, `select beneficiary_role from commission_overview`);
  eq(r.every((x) => x.beneficiary_role === 'commercial'), true); eq(r.length, 3);
});
await ok('apporteur : my_commissions avec nom du client, 2 lignes payées', async () => {
  const r = await q(U.app, `select company_name, status from my_commissions()`);
  eq(r.length, 2); eq(r[0].company_name, 'Salon Léa'); eq(r.every((x) => x.status === 'payee'), true);
});
await ok('apporteur : aucun accès aux contrats ni paiements', async () => {
  eq((await q(U.app, `select * from contract_overview`)).length, 0);
  eq((await q(U.app, `select * from payment_overview`)).length, 0);
});
await ok('commercial : voit ses contrats, montants encaissés et en attente', async () => {
  const r = await one(U.com, `select paid_cents, pending_cents from contract_overview where id=$1`, [K1]);
  eq(Number(r.paid_cents), 3900 + 3 * 2900); eq(Number(r.pending_cents), 0);
});
await ok('Hugo ne voit pas les contrats de Camille', async () => eq((await q(U.com2, `select * from contract_overview`)).length, 0));

console.log('\nCycle de vie');
await ok('site mis en ligne par le commercial → contrat activé automatiquement', async () => {
  const L5 = (await one(U.com, `select create_lead('{"name":"Ostéo"}') id`)).id;
  const k = (await one(U.com, `select convert_lead_to_customer($1, 'abonnement') id`, [L5])).id;
  await q(U.com, `update contracts set site_status='en_ligne', site_url='https://osteo.fr' where id=$1`, [k]);
  const r = (await raw(`select status, activated_at from contracts where id=$1`, [k]))[0];
  eq(r.status, 'actif'); if (!r.activated_at) throw new Error('non activé');
});
await ok('annulation : prévisionnelles annulées, acquises conservées, abonnement résilié', async () => {
  const L6 = (await one(U.com, `select create_lead('{"name":"Plombier"}') id`)).id;
  const k = (await one(U.com, `select convert_lead_to_customer($1, 'abonnement') id`, [L6])).id;
  await q(U.admin, `select set_payment_status(id, 'encaisse') from payments where contract_id=$1`, [k]);
  await q(U.admin, `select end_contract($1, 'resilie', current_date, 'Fermeture du commerce')`, [k]);
  const r = await raw(`select tranche t, status from commissions where contract_id=$1 order by tranche`, [k]);
  eq(r.map((x) => `${x.t}:${x.status}`).join(' '), '1:acquise 2:annulee');
  eq((await raw(`select status from subscriptions where contract_id=$1`, [k]))[0].status, 'resiliee');
});
await rejects('résiliation sans motif', async () => q(U.admin, `select end_contract($1, 'resilie', current_date, '  ')`, [K2]));
await rejects('un commercial ne peut pas résilier', async () => q(U.com, `select end_contract($1, 'resilie', current_date, 'x')`, [K2]));
await ok('MRR : seuls les abonnements actifs comptent', async () => {
  const r = (await raw(`select sum(monthly_amount_cents)::int m from subscriptions where status='active'`))[0];
  eq(r.m, 2900 + 2000 + 2500 + 3500); // K1 + planning K2 + prix négocié + Ostéo (nouveau tarif 35 €)
});

process.exit(done() ? 1 : 0);
