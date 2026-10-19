// Tests des permissions, rôle par rôle, sur PostgreSQL embarqué.
// Usage : npm run db:test-rls
import { createDb, as, asOwner, makeChecker } from './db-harness.mjs';

const db = await createDb({ log: false });
const { ok, rejects, eq, done } = makeChecker();

const U = {
  admin:    'a0000000-0000-0000-0000-000000000001',
  com1:     'c0000000-0000-0000-0000-000000000001',
  com2:     'c0000000-0000-0000-0000-000000000002',
  app:      'e0000000-0000-0000-0000-000000000001',
  inactive: 'f0000000-0000-0000-0000-000000000001',
  noprof:   'f0000000-0000-0000-0000-000000000002',
};
const CO1 = '10000000-0000-0000-0000-000000000001', CO2 = '10000000-0000-0000-0000-000000000002', CO3 = '10000000-0000-0000-0000-000000000003';
const L1 = '20000000-0000-0000-0000-000000000001', L2 = '20000000-0000-0000-0000-000000000002', L3 = '20000000-0000-0000-0000-000000000003';
const CU1 = '30000000-0000-0000-0000-000000000001', K1 = '40000000-0000-0000-0000-000000000001';

// --- Jeu de test (inséré comme le ferait le SQL Editor) ----------------------
await db.exec(`
  insert into auth.users values
    ('${U.admin}','admin@moka.test'), ('${U.com1}','c1@moka.test'), ('${U.com2}','c2@moka.test'),
    ('${U.app}','app@moka.test'), ('${U.inactive}','old@moka.test'), ('${U.noprof}','nobody@moka.test');
`);
await ok('bootstrap du premier admin', async () => {
  await asOwner(db, `select public.bootstrap_first_admin('ADMIN@moka.test', 'Benjamin')`);
});
await rejects('bootstrap d\'un second admin', () => asOwner(db, `select public.bootstrap_first_admin('c1@moka.test', 'X')`));
await rejects('bootstrap appelé depuis l\'application', () => as(db, U.com1, `select public.bootstrap_first_admin('c1@moka.test','X')`));

// L'Edge Function crée les profils avec la clé service
await ok('service_role (Edge Function) crée des profils', async () => {
  await as(db, 'service', `insert into profiles (id, role, full_name, email, is_active) values
    ('${U.com1}','commercial','Camille','c1@moka.test',true),
    ('${U.com2}','commercial','Hugo','c2@moka.test',true),
    ('${U.app}','apporteur','Agathe','app@moka.test',true),
    ('${U.inactive}','commercial','Ancien','old@moka.test',false)`);
});

await asOwner(db, `
  insert into companies (id, name, created_by) values
    ('${CO1}','Salon Léa','${U.com1}'), ('${CO2}','Garage Hugo','${U.com2}'), ('${CO3}','Boulangerie','${U.admin}');
  insert into contacts (company_id, first_name, email) values ('${CO1}','Léa','lea@salon.fr'), ('${CO2}','Marc','marc@garage.fr');
  insert into leads (id, company_id, owner_id, referrer_id, status, source) values
    ('${L1}','${CO1}','${U.com1}','${U.app}','gagne','apporteur'),
    ('${L2}','${CO2}','${U.com2}',null,'contacte','prospection'),
    ('${L3}','${CO3}',null,'${U.app}','a_contacter','apporteur');
  insert into lead_activities (lead_id, actor_id, kind, body) values ('${L1}','${U.com1}','note','RDV ok'), ('${L2}','${U.com2}','note','secret C2');
  insert into tasks (lead_id, type, title, due_at, assignee_id, created_by) values
    ('${L1}','appeler','Appeler Léa',now(),'${U.com1}','${U.com1}'),
    ('${L2}','appeler','Appeler Marc',now(),'${U.com2}','${U.com2}');
  insert into customers (id, company_id, lead_id, owner_id, referrer_id) values ('${CU1}','${CO1}','${L1}','${U.com1}','${U.app}');
  insert into contracts (id, reference, customer_id, offer_code, monthly_price_cents, setup_fee_cents, signed_at, activated_at, commitment_months)
    values ('${K1}','MOKA-2026-0001','${CU1}','abonnement',2900,3900,'2026-10-01','2026-10-15',12);
  insert into subscriptions (contract_id, monthly_amount_cents, started_on) values ('${K1}',2900,'2026-10-15');
  insert into payments (contract_id, kind, amount_cents, due_on, status, paid_at) values ('${K1}','mise_en_service',3900,'2026-10-15','encaisse',now());
  insert into commissions (contract_id, rule_id, beneficiary_id, beneficiary_role, offer_code, tranche, amount_cents, trigger_kind, required_payments)
    select '${K1}', r.id, b.uid::uuid, r.beneficiary_role, 'abonnement', t.n, r.amount_cents / 2,
           case t.n when 1 then 'premier_encaissement' else 'n_mensualites' end::commission_trigger,
           case t.n when 2 then 3 end
    from commission_rules r
    join (values ('commercial','${U.com1}'), ('apporteur','${U.app}')) b(role, uid) on b.role = r.beneficiary_role::text
    cross join (values (1), (2)) t(n)
    where r.offer_code = 'abonnement' and r.valid_to is null;
  insert into expenses (label, category, amount_cents, incurred_on) values ('Hébergement','frais_fixe',10000,'2026-10-01');
`);

const count = async (who, table, where = 'true') => {
  try { return Number((await as(db, who, `select count(*) c from ${table} where ${where}`)).rows[0].c); }
  catch (e) { if (/permission denied/.test(e.message)) return 0; throw e; }
};
const affected = async (who, sql) => (await as(db, who, sql)).affectedRows ?? 0;

// --- Anonyme et comptes sans droits ------------------------------------------
console.log('\nAnonyme, compte inactif, compte sans profil');
for (const t of ['profiles', 'offers', 'leads', 'companies', 'commissions', 'payments', 'audit_logs']) {
  await ok(`anonyme : 0 ligne dans ${t}`, async () => eq(await count(null, t), 0));
}
await ok('inactif : voit son propre profil (écran « compte désactivé »)', async () => eq(await count(U.inactive, 'profiles'), 1));
await ok('inactif : 0 offre, 0 prospect, 0 tâche', async () =>
  eq((await count(U.inactive, 'offers')) + (await count(U.inactive, 'leads')) + (await count(U.inactive, 'tasks')), 0));
await ok('sans profil : 0 ligne partout', async () =>
  eq((await count(U.noprof, 'profiles')) + (await count(U.noprof, 'offers')) + (await count(U.noprof, 'leads')), 0));
await rejects('inactif : ne peut pas se réactiver', () => as(db, U.inactive, `update profiles set is_active = true where id = '${U.inactive}'`));

// --- Commercial ---------------------------------------------------------------
console.log('\nCommercial (Camille)');
await ok('profils : voit uniquement le sien', async () => eq(await count(U.com1, 'profiles'), 1));
await ok('prospects : voit L1 seulement (pas L2 d\'un collègue, pas L3 non attribué)', async () => {
  const r = await as(db, U.com1, 'select id from leads');
  eq(r.rows.map((x) => x.id).join(), L1);
});
await ok('entreprises : voit Salon Léa seulement', async () => eq(await count(U.com1, 'companies'), 1));
await ok('contacts : voit ceux de ses entreprises seulement', async () => eq(await count(U.com1, 'contacts'), 1));
await ok('historique : ne voit pas les notes de son collègue', async () => eq(await count(U.com1, 'lead_activities', `body = 'secret C2'`), 0));
await ok('tâches : voit les siennes seulement', async () => eq(await count(U.com1, 'tasks'), 1));
await ok('peut modifier le statut / la relance de son prospect', async () =>
  eq(await affected(U.com1, `update leads set notes='rappeler lundi', next_follow_up_at = now() where id='${L1}'`), 1));
await ok('ne peut pas modifier le prospect d\'un collègue (0 ligne)', async () =>
  eq(await affected(U.com1, `update leads set notes='x' where id='${L2}'`), 0));
await rejects('ne peut pas se réattribuer / transférer un prospect', () => as(db, U.com1, `update leads set owner_id='${U.com2}' where id='${L1}'`));
await rejects('ne peut pas modifier l\'apporteur d\'un prospect', () => as(db, U.com1, `update leads set referrer_id=null where id='${L1}'`));
await rejects('ne peut pas créer un prospect au nom d\'un collègue', () =>
  as(db, U.com1, `insert into leads (company_id, owner_id, created_by) values ('${CO3}','${U.com2}','${U.com1}')`));
await ok('peut créer une entreprise et un prospect à son nom', async () => {
  await as(db, U.com1, `insert into companies (id, name, created_by) values ('10000000-0000-0000-0000-000000000009','Fleuriste','${U.com1}')`);
  await as(db, U.com1, `insert into leads (company_id, owner_id, created_by) values ('10000000-0000-0000-0000-000000000009','${U.com1}','${U.com1}')`);
  eq(await count(U.com1, 'leads'), 2);
});
await ok('peut ajouter une note à l\'historique', async () =>
  as(db, U.com1, `insert into lead_activities (lead_id, actor_id, kind, body) values ('${L1}','${U.com1}','appel','Messagerie')`));
await rejects('ne peut pas écrire un faux changement de statut dans l\'historique', () =>
  as(db, U.com1, `insert into lead_activities (lead_id, actor_id, kind, to_value) values ('${L1}','${U.com1}','changement_statut','gagne')`));
await rejects('ne peut pas effacer l\'historique', () => as(db, U.com1, `delete from lead_activities where lead_id='${L1}'`));
await rejects('ne peut pas supprimer un prospect', async () => {
  if ((await affected(U.com1, `delete from leads where id='${L1}'`)) === 0) throw new Error('0 ligne');
});
await ok('contrats : voit celui de son client', async () => eq(await count(U.com1, 'contracts'), 1));
await ok('peut faire avancer le statut du site', async () =>
  eq(await affected(U.com1, `update contracts set site_status='en_cours' where id='${K1}'`), 1));
await rejects('ne peut pas modifier le prix signé', () => as(db, U.com1, `update contracts set monthly_price_cents=1 where id='${K1}'`));
await ok('paiements : voit ceux de son client', async () => eq(await count(U.com1, 'payments'), 1));
await ok('commissions : voit ses 2 tranches, pas celles de l\'apporteur', async () => eq(await count(U.com1, 'commissions'), 2));
await ok('ne peut pas valider sa propre commission (0 ligne)', async () =>
  eq(await affected(U.com1, `update commissions set status='acquise', acquired_at=now()`), 0));
await ok('offres : lecture seule (3 offres, mise à jour sans effet)', async () => {
  eq(await count(U.com1, 'offers'), 3);
  eq(await affected(U.com1, `update offers set monthly_price_cents=1`), 0);
});
await ok('règles de commission : voit uniquement la grille commerciale', async () => eq(await count(U.com1, 'commission_rules', `beneficiary_role <> 'commercial'`), 0));
for (const t of ['app_settings', 'expenses', 'financial_scenarios', 'audit_logs', 'customers where false or true']) {
  const table = t.split(' ')[0];
  if (table === 'customers') continue;
  await ok(`${table} : 0 ligne`, async () => eq(await count(U.com1, table), 0));
}
await ok('clients : voit le sien seulement', async () => eq(await count(U.com1, 'customers'), 1));
await rejects('ne peut pas changer son propre rôle', () => as(db, U.com1, `update profiles set role='admin' where id='${U.com1}'`));
await ok('peut modifier son nom et son téléphone', async () =>
  eq(await affected(U.com1, `update profiles set full_name='Camille D.', phone='0600000000' where id='${U.com1}'`), 1));
await ok('annuaire : voit les admins et commerciaux actifs (pas l\'apporteur, pas l\'inactif)', async () => {
  const r = await as(db, U.com1, 'select full_name from team_directory()');
  eq(r.rows.map((x) => x.full_name).join(', '), 'Benjamin, Camille D., Hugo');
});

// --- Apporteur ----------------------------------------------------------------
console.log('\nApporteur (Agathe)');
await ok('profils : voit uniquement le sien', async () => eq(await count(U.app, 'profiles'), 1));
for (const t of ['leads', 'companies', 'contacts', 'customers', 'contracts', 'payments', 'tasks', 'lead_activities']) {
  await ok(`${t} : aucun accès direct`, async () => eq(await count(U.app, t), 0));
}
await ok('commissions : voit ses 2 tranches seulement', async () => eq(await count(U.app, 'commissions'), 2));
await ok('règles : voit uniquement la grille apporteur', async () =>
  eq(await count(U.app, 'commission_rules', `beneficiary_role <> 'apporteur'`), 0));
await ok('annuaire : vide', async () => eq(Number((await as(db, U.app, 'select count(*) c from team_directory()')).rows[0].c), 0));
await rejects('ne peut pas insérer directement un prospect', () =>
  as(db, U.app, `insert into leads (company_id, owner_id, created_by) values ('${CO3}','${U.app}','${U.app}')`));

// --- Administrateur -------------------------------------------------------------
console.log('\nAdministrateur (Benjamin)');
await ok('voit tous les profils (5)', async () => eq(await count(U.admin, 'profiles'), 5));
await ok('voit tous les prospects, y compris non attribués', async () => eq(await count(U.admin, 'leads'), 4));
await ok('réattribue un prospect', async () => eq(await affected(U.admin, `update leads set owner_id='${U.com2}' where id='${L3}'`), 1));
await ok('modifie un tarif catalogue', async () => eq(await affected(U.admin, `update offers set setup_fee_cents=4900 where code='abonnement'`), 1));
await ok('change le rôle d\'un utilisateur', async () => eq(await affected(U.admin, `update profiles set role='admin' where id='${U.com2}'`), 1));
await as(db, U.admin, `update profiles set role='commercial' where id='${U.com2}'`);
await rejects('ne peut pas se retirer ses propres droits', () => as(db, U.admin, `update profiles set role='commercial' where id='${U.admin}'`));
await rejects('ne peut pas se désactiver lui-même', () => as(db, U.admin, `update profiles set is_active=false where id='${U.admin}'`));
await ok('lit le journal d\'audit', async () => { if ((await count(U.admin, 'audit_logs')) < 1) throw new Error('vide'); });
await ok('l\'audit enregistre l\'auteur réel de la modification', async () => {
  const r = await as(db, U.admin, `select actor_id from audit_logs where table_name='offers' and action='UPDATE' order by id desc limit 1`);
  eq(r.rows[0].actor_id, U.admin);
});
await rejects('ne peut pas falsifier le journal d\'audit', () => as(db, U.admin, `delete from audit_logs`));
await ok('voit les dépenses et hypothèses', async () => eq((await count(U.admin, 'expenses')) + (await count(U.admin, 'app_settings')), 2));

// --- Règles et cycle de vie des commissions -----------------------------------
console.log('\nCommissions : statuts et double paiement');
const C1T1 = (await db.query(`select id from commissions where beneficiary_id='${U.com1}' and tranche=1`)).rows[0].id;
const C1T2 = (await db.query(`select id from commissions where beneficiary_id='${U.com1}' and tranche=2`)).rows[0].id;
await rejects('prévisionnelle → payée directement', () => as(db, U.admin, `update commissions set status='payee', acquired_at=now(), paid_at=now(), payout_ref='VIR-1' where id='${C1T1}'`));
await ok('prévisionnelle → acquise', async () => eq(await affected(U.admin, `update commissions set status='acquise', acquired_at=now() where id='${C1T1}'`), 1));
await rejects('modifier le montant d\'une commission acquise', () => as(db, U.admin, `update commissions set amount_cents=9999 where id='${C1T1}'`));
await rejects('supprimer une commission acquise', () => as(db, U.admin, `delete from commissions where id='${C1T1}'`));
await ok('acquise → payée (avec référence de virement)', async () =>
  eq(await affected(U.admin, `update commissions set status='payee', paid_at=now(), payout_ref='VIR-2026-10' where id='${C1T1}'`), 1));
await rejects('payer une deuxième fois une commission payée', () => as(db, U.admin, `update commissions set paid_at=now(), payout_ref='VIR-BIS' where id='${C1T1}'`));
await rejects('annuler une commission déjà payée', () => as(db, U.admin, `update commissions set status='annulee', cancelled_at=now(), cancel_reason='x' where id='${C1T1}'`));
await rejects('même pour la clé service (serveur)', () => as(db, 'service', `update commissions set status='annulee', cancelled_at=now(), cancel_reason='x' where id='${C1T1}'`));
await ok('prévisionnelle → annulée avec motif', async () =>
  eq(await affected(U.admin, `update commissions set status='annulee', cancelled_at=now(), cancel_reason='Contrat annulé' where id='${C1T2}'`), 1));
const RULE = (await db.query(`select id from commission_rules where beneficiary_role='commercial' and offer_code='abonnement' and valid_to is null`)).rows[0].id;
await rejects('modifier le montant d\'une règle publiée', () => as(db, U.admin, `update commission_rules set amount_cents=6000 where id='${RULE}'`));
await ok('supprimer une règle : sans effet (aucune politique DELETE)', async () => {
  eq(await affected(U.admin, `delete from commission_rules where id='${RULE}'`), 0);
  eq(Number((await db.query(`select count(*) c from commission_rules where id='${RULE}'`)).rows[0].c), 1);
});
await ok('nouvelle version de règle : clôture puis publication', async () => {
  await as(db, U.admin, `update commission_rules set valid_to = now() + interval '1 second' where id='${RULE}'`);
  await as(db, U.admin, `insert into commission_rules (beneficiary_role, offer_code, amount_cents, tranche1_bps, tranche2_bps, tranche2_after_payments, valid_from)
                         values ('commercial','abonnement',6000,5000,5000,3, now() + interval '1 second')`);
});
await ok('les commissions existantes gardent leur montant (2500 cts)', async () =>
  eq(Number((await db.query(`select amount_cents a from commissions where id='${C1T1}'`)).rows[0].a), 2500));

process.exit(done() ? 1 : 0);
