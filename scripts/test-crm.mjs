// Tests du CRM (étape 3) sur PostgreSQL embarqué.
// Usage : npm run db:test-crm
import { createDb, as, asOwner, makeChecker } from './db-harness.mjs';

const db = await createDb({ log: false });
const { ok, rejects, eq, done } = makeChecker();

const U = {
  admin: 'a0000000-0000-0000-0000-000000000001',
  com1:  'c0000000-0000-0000-0000-000000000001',
  com2:  'c0000000-0000-0000-0000-000000000002',
  app:   'e0000000-0000-0000-0000-000000000001',
  app2:  'e0000000-0000-0000-0000-000000000002',
};
await db.exec(`insert into auth.users values
  ('${U.admin}','a@m.t'),('${U.com1}','c1@m.t'),('${U.com2}','c2@m.t'),('${U.app}','e1@m.t'),('${U.app2}','e2@m.t')`);
await asOwner(db, `insert into profiles (id, role, full_name, email, is_active) values
  ('${U.admin}','admin','Benjamin','a@m.t',true), ('${U.com1}','commercial','Camille','c1@m.t',true),
  ('${U.com2}','commercial','Hugo','c2@m.t',true), ('${U.app}','apporteur','Agathe','e1@m.t',true),
  ('${U.app2}','apporteur','Paul','e2@m.t',true)`);

const q = async (who, sql, p) => (await as(db, who, sql, p)).rows;
const one = async (who, sql, p) => (await q(who, sql, p))[0];
const createLead = (who, company, contact = {}, extra = '') =>
  one(who, `select public.create_lead($1::jsonb, $2::jsonb${extra}) as id`, [JSON.stringify(company), JSON.stringify(contact)]);

console.log('Création de prospects');
let L1;
await ok('un commercial crée un prospect (entreprise + contact + prospect)', async () => {
  L1 = (await createLead(U.com1, { name: 'Salon Léa', siren: '123 456 789', city: 'Toulouse', postal_code: '31000', website: 'https://www.salon-lea.fr' },
    { first_name: 'Léa', last_name: 'Martin', email: 'Lea@Salon-Lea.fr', phone: '06 12 34 56 78' })).id;
  const r = await one(U.com1, `select owner_id, company_name, contact_email, siren from lead_overview where id = $1`, [L1]);
  eq(r.owner_id, U.com1); eq(r.company_name, 'Salon Léa'); eq(r.siren, '123456789');
});
await ok('l\'historique enregistre la création', async () => {
  const r = await q(U.com1, `select kind, actor_name from lead_timeline($1)`, [L1]);
  eq(r.length, 1); eq(r[0].kind, 'creation'); eq(r[0].actor_name, 'Camille');
});
await ok('un commercial ne peut pas créer au nom d\'un collègue (responsable forcé à lui-même)', async () => {
  const id = (await createLead(U.com1, { name: 'Fleuriste Rose' }, {}, `, 'prospection', '${U.com2}'::uuid`)).id;
  eq((await one(U.admin, `select owner_id from leads where id=$1`, [id])).owner_id, U.com1);
});
await rejects('nom d\'entreprise vide', () => createLead(U.com1, { name: '  ' }));
await rejects('SIREN mal formé', () => createLead(U.com1, { name: 'X', siren: '1234' }));
await rejects('apporteur : create_lead interdit', () => createLead(U.app, { name: 'X' }));
await rejects('appel direct de la fonction interne', () => q(U.com1, `select public._create_lead_core('{"name":"x"}','{}','prospection',null,null,null,null)`));

console.log('\nDoublons');
await ok('détection : même téléphone écrit autrement (+33 6 12…)', async () => {
  const r = await q(U.com2, `select * from find_duplicates(null, null, '+33 6 12 34 56 78', null)`);
  eq(r.length, 1); eq(r[0].match_kind, 'telephone'); eq(r[0].is_blocking, true); eq(r[0].mine, false); eq(r[0].has_open_lead, true);
});
await ok('détection : site sans www ni https = avertissement non bloquant', async () => {
  const r = await q(U.com2, `select * from find_duplicates(null, null, null, 'salon-lea.fr/contact')`);
  eq(r[0].match_kind, 'site'); eq(r[0].is_blocking, false);
});
await ok('détection : « mine » vrai pour le propriétaire', async () =>
  eq((await one(U.com1, `select mine from find_duplicates('123456789')`)).mine, true));
await rejects('création bloquée : même email en majuscules', () => createLead(U.com2, { name: 'Autre' }, { email: 'LEA@salon-lea.FR' }));
await rejects('création bloquée : même SIREN', () => createLead(U.com2, { name: 'Autre', siren: '123456789' }));
await ok('admin peut forcer un doublon de téléphone', async () => {
  await createLead(U.admin, { name: 'Salon Léa (2e salon)' }, { phone: '0612345678' }, `, 'prospection', null, null, null, true`);
});
await rejects('même forcé, un SIREN reste unique', () =>
  createLead(U.admin, { name: 'Copie', siren: '123456789' }, {}, `, 'prospection', null, null, null, true`));
await ok('un site identique n\'empêche pas la création', async () => { await createLead(U.com2, { name: 'Salon Léa Muret', website: 'salon-lea.fr' }); });
await ok('apporteur : find_duplicates ne renvoie rien', async () => eq((await q(U.app, `select * from find_duplicates('123456789')`)).length, 0));

console.log('\nApporteur');
let R1;
await ok('dépose un prospect (non attribué, source apporteur)', async () => {
  R1 = (await one(U.app, `select submit_referral($1::jsonb, $2::jsonb, 'Cherche un site') id`,
    [JSON.stringify({ name: 'Garage Hugo', city: 'Colomiers' }), JSON.stringify({ first_name: 'Hugo', phone: '05 61 00 00 00' })])).id;
  const r = await one(U.admin, `select owner_id, referrer_id, source from leads where id=$1`, [R1]);
  eq(r.owner_id, null); eq(r.referrer_id, U.app); eq(r.source, 'apporteur');
});
await ok('doublon : message générique sans nom ni responsable', async () => {
  try {
    await q(U.app, `select submit_referral('{"name":"Peu importe"}', '{"email":"lea@salon-lea.fr"}')`);
    throw new Error('accepté');
  } catch (e) {
    eq(e.message, 'Ce prospect est déjà connu de Moka Studio.');
  }
});
await ok('suit le statut de SES prospects uniquement', async () => {
  eq((await q(U.app, `select * from my_referrals()`)).length, 1);
  eq((await q(U.app2, `select * from my_referrals()`)).length, 0);
});
await ok('n\'a toujours aucun accès direct aux prospects', async () => eq((await q(U.app, `select * from lead_overview`)).length, 0));
await ok('un commercial ne peut pas utiliser my_referrals', async () => eq((await q(U.com1, `select * from my_referrals()`)).length, 0));

console.log('\nPipeline et historique');
await ok('file « à attribuer » visible par l\'admin seulement', async () => {
  eq((await q(U.admin, `select id from lead_overview where owner_id is null`)).some((r) => r.id === R1), true);
  eq((await q(U.com1, `select id from lead_overview where owner_id is null`)).length, 0);
});
await ok('l\'admin attribue → historique avec les noms', async () => {
  await q(U.admin, `update leads set owner_id = $1 where id = $2`, [U.com2, R1]);
  const r = await one(U.admin, `select from_value, to_value from lead_timeline($1) where kind='changement_responsable'`, [R1]);
  eq(r.from_value, 'Non attribué'); eq(r.to_value, 'Hugo');
});
await ok('le commercial attributaire voit le prospect', async () => eq((await q(U.com2, `select id from lead_overview where id=$1`, [R1])).length, 1));
await ok('changement de statut : historique avant/après + date mise à jour', async () => {
  const before = (await one(U.admin, `select status_changed_at s from leads where id=$1`, [L1])).s;
  await new Promise((r) => setTimeout(r, 15));
  await q(U.com1, `update leads set status='interesse' where id=$1`, [L1]);
  const r = await one(U.com1, `select from_value, to_value from lead_timeline($1) where kind='changement_statut'`, [L1]);
  eq(r.from_value, 'a_contacter'); eq(r.to_value, 'interesse');
  const after = (await one(U.admin, `select status_changed_at s from leads where id=$1`, [L1])).s;
  if (!(after > before)) throw new Error('date non mise à jour');
});
await rejects('« perdu » sans motif', () => q(U.com1, `update leads set status='perdu' where id=$1`, [L1]));
await ok('« perdu » avec motif, motif dans l\'historique', async () => {
  await q(U.com1, `update leads set status='perdu', lost_reason='Budget' where id=$1`, [L1]);
  eq((await one(U.com1, `select body from lead_timeline($1) where to_value='perdu'`, [L1])).body, 'Budget');
});
await ok('réouverture : le motif de perte est effacé', async () => {
  await q(U.com1, `update leads set status='contacte' where id=$1`, [L1]);
  eq((await one(U.com1, `select lost_reason from leads where id=$1`, [L1])).lost_reason, null);
});
await ok('consigner un appel met à jour « dernier contact »', async () => {
  await q(U.com1, `insert into lead_activities (lead_id, actor_id, kind, body) values ($1, $2, 'appel', 'OK pour RDV')`, [L1, U.com1]);
  const r = await one(U.com1, `select last_contact_at from leads where id=$1`, [L1]);
  if (!r.last_contact_at) throw new Error('vide');
});
await ok('une simple note ne compte pas comme contact', async () => {
  const id = (await createLead(U.com1, { name: 'Pressing' })).id;
  await q(U.com1, `insert into lead_activities (lead_id, actor_id, kind, body) values ($1, $2, 'note', 'à voir')`, [id, U.com1]);
  eq((await one(U.com1, `select last_contact_at from leads where id=$1`, [id])).last_contact_at, null);
});
await ok('historique d\'un autre commercial : vide', async () => eq((await q(U.com1, `select * from lead_timeline($1)`, [R1])).length, 0));

console.log('\nTâches et relances');
let T1;
await ok('un commercial crée une tâche sur son prospect', async () => {
  T1 = (await one(U.com1, `insert into tasks (lead_id, type, title, due_at, assignee_id, created_by, priority)
    values ($1, 'appeler', 'Rappeler Léa', now() - interval '1 day', $2, $2, 'haute') returning id`, [L1, U.com1])).id;
});
await rejects('… pas sur le prospect d\'un collègue', () =>
  q(U.com1, `insert into tasks (lead_id, type, title, due_at, assignee_id, created_by) values ($1,'appeler','x',now(),$2,$2)`, [R1, U.com1]));
await ok('vue des tâches : nom de l\'entreprise et tâche en retard', async () => {
  const r = await one(U.com1, `select company_name, due_at < now() as late from task_overview where id=$1`, [T1]);
  eq(r.company_name, 'Salon Léa'); eq(r.late, true);
});
await ok('compteur de tâches ouvertes sur le prospect', async () =>
  eq((await one(U.com1, `select open_tasks from lead_overview where id=$1`, [L1])).open_tasks, 1));
await ok('marquer « fait » renseigne la date automatiquement', async () => {
  await q(U.com1, `update tasks set status='fait' where id=$1`, [T1]);
  const r = await one(U.com1, `select completed_at from tasks where id=$1`, [T1]);
  if (!r.completed_at) throw new Error('vide');
  eq((await one(U.com1, `select open_tasks from lead_overview where id=$1`, [L1])).open_tasks, 0);
});
await ok('rouvrir efface la date de réalisation', async () => {
  await q(U.com1, `update tasks set status='a_faire' where id=$1`, [T1]);
  eq((await one(U.com1, `select completed_at from tasks where id=$1`, [T1])).completed_at, null);
});
await ok('le collègue ne voit pas cette tâche', async () => eq((await q(U.com2, `select id from task_overview where id=$1`, [T1])).length, 0));
await ok('seuil « prospect inactif » lisible (14 jours)', async () => eq((await one(U.com1, `select stale_lead_days() d`)).d, 14));
await ok('… mais pas pour un anonyme', async () => {
  let v = null;
  try { v = (await one(null, `select stale_lead_days() d`)).d; } catch { v = null; }
  eq(v, null);
});

process.exit(done() ? 1 : 0);
