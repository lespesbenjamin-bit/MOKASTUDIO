// Vérifie le schéma (contraintes métier) sur un PostgreSQL embarqué.
// Usage : npm run db:verify
import { createDb, as } from './db-harness.mjs';

const db = await createDb();
let pass = 0, fail = 0;

const one = async (sql, p) => (await db.query(sql, p)).rows[0];
async function ok(label, fn) {
  try { await fn(); pass++; console.log(`  ✓ ${label}`); }
  catch (e) { fail++; console.log(`  ✗ ${label} → ${e.message}`); }
}
async function rejects(label, sql) {
  try { await db.exec(sql); fail++; console.log(`  ✗ ${label} → aurait dû être refusé`); }
  catch { pass++; console.log(`  ✓ ${label} (refusé)`); }
}
const eq = (a, b) => { if (a !== b) throw new Error(`attendu ${b}, obtenu ${a}`); };

console.log('\nNormalisation');
await ok('téléphone 06 12 34 56 78 → 33612345678', async () => eq((await one(`select normalize_phone('06 12 34 56 78') v`)).v, '33612345678'));
await ok('téléphone +33 (0)6 12… → 33612345678', async () => eq((await one(`select normalize_phone('+33 (0)6 12 34 56 78') v`)).v, '33612345678'));
await ok('téléphone 0033612345678 → 33612345678', async () => eq((await one(`select normalize_phone('0033612345678') v`)).v, '33612345678'));
await ok('domaine https://www.Salon-Lea.fr/contact → salon-lea.fr', async () => eq((await one(`select normalize_domain('https://www.Salon-Lea.fr/contact') v`)).v, 'salon-lea.fr'));
await ok('email "  Lea@Mail.FR " → lea@mail.fr', async () => eq((await one(`select normalize_email('  Lea@Mail.FR ') v`)).v, 'lea@mail.fr'));

console.log('\nDonnées de référence');
await ok('3 offres', async () => eq(Number((await one(`select count(*) c from offers`)).c), 3));
await ok('abonnement = 2900 cts/mois, 3900 cts de mise en service', async () => {
  const r = await one(`select monthly_price_cents m, setup_fee_cents s from offers where code='abonnement'`);
  eq(Number(r.m), 2900); eq(Number(r.s), 3900);
});
await ok('6 règles de commission courantes', async () => eq(Number((await one(`select count(*) c from commission_rules where valid_to is null`)).c), 6));
await ok('3 scénarios de référence', async () => eq(Number((await one(`select count(*) c from financial_scenarios where is_reference`)).c), 3));

console.log('\nContraintes métier');
await db.exec(`
  insert into auth.users values ('00000000-0000-0000-0000-000000000001','admin@moka.test');
  insert into profiles (id, role, full_name, email, is_active) values ('00000000-0000-0000-0000-000000000001','admin','Admin','admin@moka.test',true);
  insert into companies (id, name, siren, website, postal_code, city) values
    ('10000000-0000-0000-0000-000000000001','Salon Léa','123456789','https://www.salon-lea.fr/','31000','Toulouse');
  insert into contacts (company_id, first_name, email, phone, is_primary)
    values ('10000000-0000-0000-0000-000000000001','Léa','LEA@salon-lea.fr','06 12 34 56 78',true);
  insert into leads (id, company_id) values ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001');
`);
await ok('colonnes générées (domaine, email, tél.) remplies', async () => {
  const r = await one(`select c.website_domain d, k.email_normalized e, k.phone_normalized p from companies c join contacts k on k.company_id=c.id`);
  eq(r.d, 'salon-lea.fr'); eq(r.e, 'lea@salon-lea.fr'); eq(r.p, '33612345678');
});
await rejects('SIREN en double', `insert into companies (name, siren) values ('Autre','123456789')`);
await rejects('SIREN invalide (8 chiffres)', `insert into companies (name, siren) values ('X','12345678')`);
await rejects('deuxième prospect ouvert sur la même entreprise', `insert into leads (company_id) values ('10000000-0000-0000-0000-000000000001')`);
await rejects('statut "perdu" sans motif', `update leads set status='perdu' where id='20000000-0000-0000-0000-000000000001'`);
await rejects('statut hors pipeline', `update leads set status='en_pause' where id='20000000-0000-0000-0000-000000000001'`);
await ok('tâche créée « fait » : date de réalisation remplie automatiquement', async () => {
  const r = await one(`insert into tasks (lead_id,type,title,due_at,status,assignee_id) values ('20000000-0000-0000-0000-000000000001','appeler','x',now(),'fait','00000000-0000-0000-0000-000000000001') returning completed_at`);
  if (!r.completed_at) throw new Error('vide');
});

await db.exec(`
  insert into customers (id, company_id, lead_id) values ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001');
  insert into contracts (id, reference, customer_id, offer_code, monthly_price_cents, setup_fee_cents, signed_at, activated_at, commitment_months)
    values ('40000000-0000-0000-0000-000000000001','MOKA-2026-0001','30000000-0000-0000-0000-000000000001','abonnement',2900,3900,'2026-10-01','2026-10-15',12);
  insert into subscriptions (id, contract_id, monthly_amount_cents, started_on)
    values ('50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',2900,'2026-10-15');
  insert into payments (contract_id, subscription_id, kind, amount_cents, due_on, period_month)
    values ('40000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','mensualite',2900,'2026-11-01','2026-11-01');
`);
await ok('fin d\'engagement calculée (15/10/2026 + 12 mois)', async () => eq(String((await one(`select commitment_end_at::text d from contracts`)).d), '2027-10-15'));
await ok('modifier le catalogue ne change pas le prix signé', async () => {
  await db.exec(`update offers set monthly_price_cents = 3500 where code='abonnement'`);
  eq(Number((await one(`select monthly_price_cents m from contracts`)).m), 2900);
});
await rejects('montant négatif', `insert into payments (contract_id, kind, amount_cents, due_on) values ('40000000-0000-0000-0000-000000000001','autre',-100,'2026-11-01')`);
await rejects('abonnement sans mensualité', `insert into contracts (reference, customer_id, offer_code, signed_at) values ('MOKA-X','30000000-0000-0000-0000-000000000001','abonnement','2026-10-01')`);
await rejects('site "en ligne" sans URL', `update contracts set site_status='en_ligne' where reference='MOKA-2026-0001'`);
await rejects('deux mensualités pour le même mois', `insert into payments (contract_id, subscription_id, kind, amount_cents, due_on, period_month) values ('40000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','mensualite',2900,'2026-11-01','2026-11-01')`);
await ok('paiement encaissé : date d’encaissement remplie automatiquement', async () => {
  await db.exec(`update payments set status='encaisse'`);
  const r = await one(`select paid_at from payments limit 1`);
  if (!r.paid_at) throw new Error('vide');
  await db.exec(`update payments set status='en_attente'`);
});

const ruleId = (await one(`select id from commission_rules where beneficiary_role='commercial' and offer_code='abonnement'`)).id;
await db.exec(`insert into commissions (contract_id, rule_id, beneficiary_id, beneficiary_role, offer_code, tranche, amount_cents, trigger_kind)
  values ('40000000-0000-0000-0000-000000000001','${ruleId}','00000000-0000-0000-0000-000000000001','commercial','abonnement',1,2500,'premier_encaissement')`);
await rejects('même tranche de commission générée deux fois', `insert into commissions (contract_id, rule_id, beneficiary_id, beneficiary_role, offer_code, tranche, amount_cents, trigger_kind)
  values ('40000000-0000-0000-0000-000000000001','${ruleId}','00000000-0000-0000-0000-000000000001','commercial','abonnement',1,2500,'premier_encaissement')`);
await rejects('commission "payée" sans référence de virement', `update commissions set status='payee', acquired_at=now(), paid_at=now()`);
await rejects('deuxième règle courante pour le même couple', `insert into commission_rules (beneficiary_role, offer_code, amount_cents, tranche1_bps) values ('commercial','abonnement',6000,10000)`);
await rejects('règle dont les tranches ≠ 100 %', `insert into commission_rules (beneficiary_role, offer_code, amount_cents, tranche1_bps, tranche2_bps, tranche2_after_payments, valid_to) values ('commercial','abonnement',6000,5000,4000,3,now()+interval '1 day')`);
await rejects('scénario sans hypothèse obligatoire', `insert into financial_scenarios (name, kind, start_month, assumptions) values ('x','personnalise','2026-10-01','{"new_subscriptions_per_month":1}')`);

console.log('\nAudit et RLS');
await ok('changement de prix catalogue journalisé', async () => {
  const r = await one(`select changed_fields f from audit_logs where table_name='offers' and action='UPDATE'`);
  eq(r.f.join(','), 'monthly_price_cents');
});
await ok('RLS activée sur toutes les tables public', async () => {
  const r = await one(`select count(*) filter (where not c.relrowsecurity) n, count(*) t from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'`);
  eq(Number(r.n), 0); console.log(`    (${r.t} tables)`);
});
await ok('anonyme : aucune ligne visible', async () => {
  let n = 0;
  try { n = (await as(db, null, 'select count(*) c from offers')).rows[0].c; } catch { n = 0; }
  eq(Number(n), 0);
});

console.log(`\n${pass} vérifications OK, ${fail} en échec`);
process.exit(fail ? 1 : 0);
