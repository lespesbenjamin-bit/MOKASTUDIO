// Tests de l'import de prospects sur PostgreSQL embarqué.
// Usage : npm run db:test-import
import { createDb, as, asOwner, makeChecker } from './db-harness.mjs';

const db = await createDb({ log: false });
const { ok, rejects, eq, done } = makeChecker();
const U = { admin: 'a0000000-0000-0000-0000-000000000001', com: 'c0000000-0000-0000-0000-000000000001', app: 'e0000000-0000-0000-0000-000000000001' };
await db.exec(`insert into auth.users values ('${U.admin}','a@m.t'),('${U.com}','c@m.t'),('${U.app}','e@m.t')`);
await asOwner(db, `insert into profiles (id, role, full_name, email, is_active) values
  ('${U.admin}','admin','Benjamin','a@m.t',true), ('${U.com}','commercial','Camille','c@m.t',true), ('${U.app}','apporteur','Agathe','e@m.t',true)`);

const count = async (sql) => Number((await db.query(sql)).rows[0].c);
const run = async (who, rows, opts = {}) =>
  (await as(db, who, `select import_leads($1::jsonb, $2::lead_source, $3::uuid, null, 'prospects.xlsx', $4) r`,
    [JSON.stringify(rows), opts.source ?? 'prospection', opts.owner ?? null, opts.dryRun ?? true])).rows[0].r;

// Un prospect existe déjà en base
await as(db, U.com, `select create_lead('{"name":"Salon Léa","siren":"123456789"}', '{"phone":"06 12 34 56 78"}')`);

const rows = [
  { company: { name: 'Garage du Canal', city: 'Colomiers', postal_code: '31770' }, contact: { first_name: 'Hugo', phone: '05 61 00 00 01' } },
  { company: { name: 'Salon Léa bis' }, contact: { phone: '+33 6 12 34 56 78' } },               // doublon téléphone
  { company: { name: 'Copie', siren: '123456789' }, contact: {} },                                // doublon SIREN
  { company: { name: '' }, contact: { email: 'x@y.fr' } },                                       // erreur : nom manquant
  { company: { name: 'Boulangerie', postal_code: '310' }, contact: {} },                         // erreur : code postal
  { company: { name: 'Fleuriste Rose' }, contact: { email: 'rose@fleur.fr' }, notes: 'Vu au salon' },
];

console.log('Simulation');
await ok('rapport ligne par ligne exact', async () => {
  const r = await run(U.admin, rows);
  eq(r.dry_run, true); eq(r.total, 6); eq(r.imported, 2); eq(r.duplicates, 2); eq(r.errors, 2);
  eq(r.rows.map((x) => x.status).join(','), 'importe,doublon,doublon,erreur,erreur,importe');
  eq(r.rows[1].message, 'Doublon : « Salon Léa » existe déjà (même téléphone)');
  eq(r.rows[3].message, 'Le nom de l\'entreprise est obligatoire');
});
await ok('… sans rien écrire en base', async () => {
  eq(await count(`select count(*) c from leads`), 1);
  eq(await count(`select count(*) c from companies`), 1);
});

console.log('\nImport réel');
await ok('importe les lignes valides, ignore les autres', async () => {
  const r = await run(U.admin, rows, { dryRun: false, owner: U.com, source: 'salon' });
  eq(r.imported, 2); eq(r.duplicates, 2); eq(r.errors, 2);
  eq(await count(`select count(*) c from leads`), 3);
});
await ok('responsable, source et statut appliqués', async () => {
  const r = (await db.query(`select l.owner_id, l.source, l.status, l.notes from leads l join companies c on c.id=l.company_id where c.name='Fleuriste Rose'`)).rows[0];
  eq(r.owner_id, U.com); eq(r.source, 'salon'); eq(r.status, 'a_contacter'); eq(r.notes, 'Vu au salon');
});
await ok('historique : création + « Importé depuis »', async () => {
  const r = (await db.query(`select string_agg(coalesce(body, kind::text), ' | ' order by a.created_at) h from lead_activities a join leads l on l.id=a.lead_id join companies c on c.id=l.company_id where c.name='Garage du Canal'`)).rows[0];
  eq(r.h, 'creation | Importé depuis « prospects.xlsx »');
});
await ok('le commercial voit les prospects importés pour lui', async () =>
  eq(Number((await as(db, U.com, `select count(*) c from lead_overview`)).rows[0].c), 3));
await ok('réimporter le même fichier ne crée aucun doublon', async () => {
  const r = await run(U.admin, rows, { dryRun: false });
  eq(r.imported, 0); eq(await count(`select count(*) c from leads`), 3);
});

console.log('\nSécurité et limites');
await rejects('un commercial ne peut pas importer', () => run(U.com, rows));
await rejects('un apporteur ne peut pas importer', () => run(U.app, rows));
await rejects('responsable inexistant', () => run(U.admin, rows, { owner: 'f0000000-0000-0000-0000-000000000009' }));
await rejects('plus de 500 lignes par envoi', () => run(U.admin, Array.from({ length: 501 }, (_, i) => ({ company: { name: `E${i}` } }))));
await ok('500 lignes en un envoi (simulation)', async () => {
  const t = Date.now();
  const r = await run(U.admin, Array.from({ length: 500 }, (_, i) => ({ company: { name: `Entreprise ${i}` }, contact: { phone: `06 00 00 ${String(i).padStart(4, '0').slice(0, 2)} ${String(i).padStart(4, '0').slice(2)}` } })));
  eq(r.imported, 500);
  console.log(`    (${Date.now() - t} ms en local)`);
});

process.exit(done() ? 1 : 0);
