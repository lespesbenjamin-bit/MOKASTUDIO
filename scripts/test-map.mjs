// Tests de la cartographie (coordonnées GPS, vue map_points, droits).
// Usage : npm run db:test-map
import { createDb, as, asOwner, makeChecker } from './db-harness.mjs';

const db = await createDb({ log: false });
const { ok, rejects, eq, done } = makeChecker();
const U = {
  admin: 'a0000000-0000-0000-0000-000000000001',
  c1: 'c0000000-0000-0000-0000-000000000001',
  c2: 'c0000000-0000-0000-0000-000000000002',
  app: 'b0000000-0000-0000-0000-000000000001',
};
await db.exec(`insert into auth.users values ('${U.admin}','a@m.t'),('${U.c1}','c1@m.t'),('${U.c2}','c2@m.t'),('${U.app}','p@m.t')`);
await asOwner(db, `insert into profiles (id, role, full_name, email, is_active) values
  ('${U.admin}','admin','Benjamin','a@m.t',true), ('${U.c1}','commercial','Camille','c1@m.t',true),
  ('${U.c2}','commercial','Hugo','c2@m.t',true), ('${U.app}','apporteur','Paul','p@m.t',true)`);

const q = async (who, sql, p) => (await as(db, who, sql, p)).rows;
const one = async (who, sql, p) => (await q(who, sql, p))[0];
const lead = async (who, name, city) =>
  (await one(who, `select create_lead($1::jsonb) id`, [JSON.stringify({ name, city, address: '1 rue de la Paix', postal_code: '31000' })])).id;

const L1 = await lead(U.c1, 'Salon Léa', 'Toulouse');
const L2 = await lead(U.c1, 'Garage Martin', 'Blagnac');
const L3 = await lead(U.c2, 'Pressing Hugo', 'Muret');
const co = async (L) => (await one(U.admin, `select company_id from leads where id=$1`, [L])).company_id;
const C1 = await co(L1), C2 = await co(L2), C3 = await co(L3);

console.log('Coordonnées GPS');
await ok('le commercial enregistre la position de son entreprise', async () => {
  const r = await q(U.c1, `update companies set latitude=43.6045, longitude=1.4440, geocode_precision='adresse',
    geocode_label='1 Rue de la Paix 31000 Toulouse', geocoded_at=now() where id=$1 returning id`, [C1]);
  eq(r.length, 1);
});
await ok('il ne peut pas modifier celle d\'un collègue (0 ligne)', async () => {
  const r = await q(U.c1, `update companies set latitude=1, longitude=1, geocoded_at=now() where id=$1 returning id`, [C3]);
  eq(r.length, 0);
});
await rejects('latitude hors limites refusée', () =>
  q(U.c1, `update companies set latitude=120, longitude=1, geocoded_at=now() where id=$1`, [C2]));
await rejects('latitude sans longitude refusée', () =>
  q(U.c1, `update companies set latitude=43, longitude=null, geocoded_at=now() where id=$1`, [C2]));
await rejects('précision inconnue refusée', () =>
  q(U.c1, `update companies set geocode_precision='xyz', geocoded_at=now() where id=$1`, [C2]));
await ok('adresse introuvable : marquée sans coordonnées', async () => {
  await q(U.c1, `update companies set geocode_precision='introuvable', geocoded_at=now() where id=$1`, [C2]);
  eq((await one(U.c1, `select geocode_precision p from companies where id=$1`, [C2])).p, 'introuvable');
});
await ok('changement d\'adresse → coordonnées effacées (à recalculer)', async () => {
  await q(U.c1, `update companies set city='Colomiers' where id=$1`, [C2]);
  const r = await one(U.c1, `select latitude, geocode_precision, geocoded_at from companies where id=$1`, [C2]);
  eq(r.latitude, null); eq(r.geocode_precision, null); eq(r.geocoded_at, null);
});
await ok('adresse + position dans la même mise à jour → position conservée', async () => {
  await q(U.c1, `update companies set city='Tournefeuille', latitude=43.58, longitude=1.34, geocode_precision='ville',
    geocoded_at=now() where id=$1`, [C2]);
  eq((await one(U.c1, `select latitude from companies where id=$1`, [C2])).latitude, 43.58);
});
await ok('autre modification (nom) → position conservée', async () => {
  await q(U.c1, `update companies set name='Salon Léa & Co' where id=$1`, [C1]);
  eq((await one(U.c1, `select latitude from companies where id=$1`, [C1])).latitude, 43.6045);
});

console.log('\nPoints de la carte');
await ok('admin : 3 points', async () => eq((await q(U.admin, `select * from map_points`)).length, 3));
await ok('commercial 1 : uniquement ses 2 points', async () => {
  const r = await q(U.c1, `select company_name from map_points order by company_name`);
  eq(r.length, 2); eq(r.every((x) => x.company_name !== 'Pressing Hugo'), true);
});
await ok('commercial 2 : uniquement son point', async () => eq((await q(U.c2, `select * from map_points`)).length, 1));
await ok('apporteur : aucun point', async () => eq((await q(U.app, `select * from map_points`)).length, 0));
await rejects('anonyme : accès refusé', () => q(null, `select * from map_points`));
await ok('statut et position du prospect exposés', async () => {
  await q(U.c1, `update leads set status='rdv_programme' where id=$1`, [L1]);
  const r = await one(U.c1, `select kind, status, latitude, lead_id, owner_name from map_points where company_id=$1`, [C1]);
  eq(r.kind, 'prospect'); eq(r.status, 'rdv_programme'); eq(r.latitude, 43.6045); eq(r.lead_id, L1); eq(r.owner_name, 'Camille');
});
await ok('après conversion : point « client » avec son contrat', async () => {
  const K = (await one(U.c1, `select convert_lead_to_customer($1, 'abonnement') id`, [L1])).id;
  const r = await one(U.c1, `select kind, status, contract_id, offer_code from map_points where company_id=$1`, [C1]);
  eq(r.kind, 'client'); eq(r.status, 'client'); eq(r.contract_id, K); eq(r.offer_code, 'abonnement');
  eq((await q(U.c1, `select * from map_points where company_id=$1`, [C1])).length, 1);
});
await ok('contrat terminé → redevient un point prospect (statut du prospect)', async () => {
  const K = (await one(U.admin, `select contract_id from map_points where company_id=$1`, [C1])).contract_id;
  await asOwner(db, `update contracts set status='termine', terminated_at=now(), termination_reason='test' where id='${K}'`);
  eq((await one(U.admin, `select kind from map_points where company_id=$1`, [C1])).kind, 'prospect');
});

process.exit(done() ? 1 : 0);
