// Tests du module PROJETS CLIENTS : création, préremplissage, lien client,
// portail sans compte, fichiers, statuts, brief, notifications, droits.
// Usage : npm run db:test-projects
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
const ANON = null, SERVICE = 'service';

// Deux clients signés : Salon Léa (Camille) et Garage (Hugo)
const L1 = (await one(U.c1, `select create_lead($1::jsonb, $2::jsonb) id`, [JSON.stringify({
  name: 'Salon Léa', sector: 'Institut de beauté', address: '12 rue des Lois', postal_code: '31000', city: 'Toulouse',
  website: 'https://salon-lea.fr',
}), JSON.stringify({ first_name: 'Léa', last_name: 'Martin', phone: '06 11 22 33 44', email: 'lea@salon-lea.fr' })])).id;
const L2 = (await one(U.c2, `select create_lead($1::jsonb) id`, [JSON.stringify({ name: 'Garage Hugo', city: 'Muret' })])).id;
const K1 = (await one(U.c1, `select convert_lead_to_customer($1, 'abonnement') id`, [L1])).id;
const K2 = (await one(U.c2, `select convert_lead_to_customer($1, 'abonnement') id`, [L2])).id;
let P1, P2, TOKEN, TOKEN_OLD, FILE;

console.log('Création du projet');
await rejects('apporteur : création refusée', () => q(U.app, `select create_client_project($1)`, [K1]));
await rejects('commercial : refusé sur le client d\'un collègue', () => q(U.c1, `select create_client_project($1)`, [K2]));
await rejects('anonyme : refusé', () => q(ANON, `select create_client_project($1)`, [K1]));
await ok('commercial : crée le projet de son client', async () => {
  P1 = (await one(U.c1, `select create_client_project($1) id`, [K1])).id;
  const p = await one(U.c1, `select status, title, customer_id, contract_id, assignee_id from client_projects where id=$1`, [P1]);
  eq(p.status, 'en_attente_infos'); eq(p.title, 'Site internet — Salon Léa'); eq(p.contract_id, K1); eq(p.assignee_id, U.admin);
});
await rejects('un seul projet actif par contrat', () => q(U.c1, `select create_client_project($1)`, [K1]));
await ok('questionnaire prérempli depuis le CRM', async () => {
  const a = (await one(U.c1, `select answers from project_questionnaires where project_id=$1`, [P1])).answers;
  eq(a.nom_commercial, 'Salon Léa'); eq(a.secteur, 'institut_beaute'); eq(a.ville, 'Toulouse'); eq(a.code_postal, '31000');
  eq(a.telephone, '06 11 22 33 44'); eq(a.email_public, 'lea@salon-lea.fr'); eq(a.site_existant, 'oui'); eq(a.site_url, 'https://salon-lea.fr');
});
await ok('historique : « projet créé » + notification à l\'admin', async () => {
  eq((await one(U.c1, `select count(*)::int n from project_events where project_id=$1 and kind='projet_cree'`, [P1])).n, 1);
  eq((await one(U.admin, `select count(*)::int n from notifications where project_id=$1`, [P1])).n, 1);
  eq((await one(U.c1, `select count(*)::int n from notifications where project_id=$1`, [P1])).n, 0); // pas pour l'auteur
});
P2 = (await one(U.c2, `select create_client_project($1) id`, [K2])).id;

console.log('\nCloisonnement');
await ok('commercial 2 ne voit pas le projet du commercial 1', async () => {
  eq((await q(U.c2, `select id from client_projects where id=$1`, [P1])).length, 0);
  eq((await q(U.c2, `select id from project_overview where id=$1`, [P1])).length, 0);
  eq((await q(U.c2, `select * from project_questionnaires where project_id=$1`, [P1])).length, 0);
  eq((await q(U.c2, `select * from project_events where project_id=$1`, [P1])).length, 0);
});
await ok('admin voit tous les projets', async () => eq((await q(U.admin, `select id from project_overview`)).length, 2));
await ok('apporteur ne voit aucun projet', async () => eq((await q(U.app, `select id from project_overview`)).length, 0));
await rejects('écriture directe sur les projets interdite (même pour son client)', () =>
  q(U.c1, `update client_projects set status='livre' where id=$1`, [P1]));
await rejects('insertion directe interdite', () =>
  q(U.c1, `insert into client_projects (customer_id, title) select customer_id, 'x' from client_projects where id=$1`, [P1]));
await rejects('commercial 2 : commentaire refusé sur le projet du commercial 1', () =>
  q(U.c2, `select add_project_comment($1, 'Bonjour')`, [P1]));
await rejects('commercial 2 : modification des réponses refusée', () =>
  q(U.c2, `select project_save_answers($1, '{"ville":"Paris"}'::jsonb)`, [P1]));
for (const t of ['client_projects', 'project_questionnaires', 'project_files', 'project_events', 'project_access_tokens', 'project_overview', 'notifications']) {
  await rejects(`anonyme : lecture de ${t} refusée`, () => q(ANON, `select * from ${t}`));
}
await rejects('fonctions internes non appelables', () => q(U.c1, `select _save_answers($1, '{}'::jsonb, 0, 0, 'equipe', null)`, [P1]));

console.log('\nMode A : le commercial remplit avec le client');
await ok('sauvegarde progressive (fusion des réponses)', async () => {
  await q(U.c1, `select project_save_answers($1, '{"horaires":"Mar-Sam 9h-19h","objectifs":["visibilite","reservation"]}'::jsonb, 1, 30)`, [P1]);
  await q(U.c1, `select project_save_answers($1, '{"pages":["accueil","tarifs"]}'::jsonb, 2, 45)`, [P1]);
  const r = await one(U.c1, `select status, current_step, completion_pct, answers, last_saved_via from project_questionnaires where project_id=$1`, [P1]);
  eq(r.status, 'en_cours'); eq(r.current_step, 2); eq(r.completion_pct, 45); eq(r.last_saved_via, 'equipe');
  eq(r.answers.horaires, 'Mar-Sam 9h-19h'); eq(r.answers.pages.length, 2); eq(r.answers.nom_commercial, 'Salon Léa');
});
await ok('« questionnaire commencé » journalisé une seule fois', async () =>
  eq((await one(U.c1, `select count(*)::int n from project_events where project_id=$1 and kind='questionnaire_commence'`, [P1])).n, 1));
await rejects('réponses : clé invalide refusée', () => q(U.c1, `select project_save_answers($1, '{"Bad Key":"x"}'::jsonb)`, [P1]));
await rejects('réponses : texte trop long refusé', () => q(U.c1, `select project_save_answers($1, jsonb_build_object('description', repeat('a', 5001)))`, [P1]));
await rejects('réponses : objet imbriqué refusé', () => q(U.c1, `select project_save_answers($1, '{"pages":[{"x":1}]}'::jsonb)`, [P1]));
await rejects('réponses : tableau JSON refusé', () => q(U.c1, `select project_save_answers($1, '[1,2]'::jsonb)`, [P1]));

console.log('\nMode B : lien client');
await ok('création du lien : jeton de 64 caractères, seule l\'empreinte est stockée', async () => {
  const r = (await one(U.c1, `select create_project_link($1) r`, [P1])).r;
  TOKEN_OLD = r.token;
  if (!/^[0-9a-f]{64}$/.test(TOKEN_OLD)) throw new Error('format du jeton');
  const stored = (await db.query(`select token_hash from project_access_tokens where project_id=$1`, [P1])).rows[0].token_hash;
  if (stored === TOKEN_OLD || stored.includes(TOKEN_OLD.slice(0, 16))) throw new Error('jeton stocké en clair');
});
await rejects('l\'empreinte du jeton n\'est pas lisible depuis l\'application', () =>
  q(U.admin, `select token_hash from project_access_tokens`));
await ok('nouveau lien → l\'ancien est révoqué', async () => {
  TOKEN = (await one(U.c1, `select create_project_link($1) r`, [P1])).r.token;
  if (TOKEN === TOKEN_OLD) throw new Error('jeton identique');
  eq((await one(U.c1, `select count(*)::int n from project_access_tokens where project_id=$1 and revoked_at is null`, [P1])).n, 1);
});
await rejects('ancien lien refusé', () => q(ANON, `select portal_open($1)`, [TOKEN_OLD]));
await rejects('jeton inventé refusé', () => q(ANON, `select portal_open($1)`, ['a'.repeat(64)]));
await rejects('jeton mal formé refusé', () => q(ANON, `select portal_open($1)`, [`' or 1=1 --`]));
await ok('client sans compte : ouvre SON projet (et rien d\'autre)', async () => {
  const r = (await one(ANON, `select portal_open($1) r`, [TOKEN])).r;
  eq(r.project.company_name, 'Salon Léa'); eq(r.questionnaire.answers.horaires, 'Mar-Sam 9h-19h');
  eq(r.planning_monthly_cents, 2000);
  if (JSON.stringify(r).includes('Garage Hugo')) throw new Error('fuite d\'un autre projet');
  for (const k of ['customer_id', 'owner_id', 'contract_id', 'token_hash']) if (JSON.stringify(r).includes(k)) throw new Error(`champ interne exposé : ${k}`);
});
await ok('utilisation du lien comptabilisée', async () =>
  eq((await one(U.c1, `select use_count from project_access_tokens where project_id=$1 and revoked_at is null`, [P1])).use_count, 1));
await ok('client : sauvegarde progressive', async () => {
  await q(ANON, `select portal_save($1, '{"instagram":"@salonlea","ambiances":["elegant"]}'::jsonb, 3, 60)`, [TOKEN]);
  const r = await one(U.c1, `select answers, last_saved_via, current_step from project_questionnaires where project_id=$1`, [P1]);
  eq(r.answers.instagram, '@salonlea'); eq(r.answers.pages.length, 2); eq(r.last_saved_via, 'client'); eq(r.current_step, 3);
});
await rejects('client : réponses invalides refusées', () => q(ANON, `select portal_save($1, '{"x y":1}'::jsonb)`, [TOKEN]));
await rejects('le jeton d\'un projet ne permet pas d\'écrire sur un autre', () =>
  q(ANON, `select portal_file_delete($1, (select id from project_files limit 1))`, [TOKEN]));

console.log('\nDocuments');
await rejects('format refusé (exécutable)', () => q(ANON, `select portal_file_begin($1, 'logo', 'virus.exe', 'application/x-msdownload', 1000)`, [TOKEN]));
await rejects('format refusé (SVG)', () => q(ANON, `select portal_file_begin($1, 'logo', 'logo.svg', 'image/svg+xml', 1000)`, [TOKEN]));
await rejects('taille refusée (> 10 Mo)', () => q(ANON, `select portal_file_begin($1, 'logo', 'big.png', 'image/png', 10485761)`, [TOKEN]));
await rejects('catégorie inconnue refusée', () => q(ANON, `select portal_file_begin($1, 'divers', 'a.png', 'image/png', 100)`, [TOKEN]));
await ok('dépôt : chemin rangé dans le dossier du projet, nom nettoyé', async () => {
  const r = (await one(ANON, `select portal_file_begin($1, 'logo', '../../etc/Logo Salon.PNG', 'image/png', 52000) r`, [TOKEN])).r;
  FILE = r.file_id;
  if (!r.path.startsWith(`${P1}/`) || !r.path.endsWith('.png')) throw new Error(r.path);
  eq((await one(U.c1, `select original_name, status from project_files where id=$1`, [FILE])).original_name, 'Logo Salon.PNG');
});
await ok('fichier non confirmé invisible pour le client', async () =>
  eq((await one(ANON, `select portal_open($1) r`, [TOKEN])).r.files.length, 0));
await rejects('confirmation réservée au serveur (anonyme)', () => q(ANON, `select project_file_confirm($1, true)`, [FILE]));
await rejects('confirmation réservée au serveur (commercial)', () => q(U.c1, `select project_file_confirm($1, true)`, [FILE]));
await ok('confirmation serveur → visible, historique + notifications', async () => {
  await q(SERVICE, `select project_file_confirm($1, true)`, [FILE]);
  eq((await one(ANON, `select portal_open($1) r`, [TOKEN])).r.files.length, 1);
  eq((await one(U.c1, `select count(*)::int n from project_events where project_id=$1 and kind='documents_ajoutes'`, [P1])).n, 1);
  eq((await one(U.c1, `select count(*)::int n from notifications where kind='documents_ajoutes'`)).n, 1);
});
await ok('contenu invalide détecté par le serveur → document supprimé', async () => {
  const r = (await one(ANON, `select portal_file_begin($1, 'photos_etablissement', 'faux.jpg', 'image/jpeg', 100) r`, [TOKEN])).r;
  const path = (await one(SERVICE, `select project_file_confirm($1, false) p`, [r.file_id])).p;
  eq(path, r.path);
  eq((await q(U.c1, `select id from project_files where id=$1`, [r.file_id])).length, 0);
});
await ok('le client retire un document qu\'il a envoyé', async () => {
  const r = (await one(ANON, `select portal_file_begin($1, 'autres', 'tarifs.pdf', 'application/pdf', 3000) r`, [TOKEN])).r;
  await q(SERVICE, `select project_file_confirm($1, true)`, [r.file_id]);
  eq((await one(ANON, `select portal_file_delete($1, $2) p`, [TOKEN, r.file_id])).p, r.path);
});
await ok('stockage : l\'équipe du projet lit le fichier, pas les autres', async () => {
  await asOwner(db, `insert into storage.objects (bucket_id, name) values ('project-files', '${P1}/x.png')`);
  eq((await q(U.c1, `select name from storage.objects`)).length, 1);
  eq((await q(U.admin, `select name from storage.objects`)).length, 1);
  eq((await q(U.c2, `select name from storage.objects`)).length, 0);
});
await ok('bucket privé, 10 Mo, 4 formats', async () => {
  const b = (await db.query(`select * from storage.buckets where id='project-files'`)).rows[0];
  eq(b.public, false); eq(Number(b.file_size_limit), 10485760); eq(b.allowed_mime_types.length, 4);
});

console.log('\nValidation finale par le client');
await rejects('sans la case de confirmation : refusé', () => q(ANON, `select portal_submit($1, false)`, [TOKEN]));
await ok('transmission → « Questionnaire reçu »', async () => {
  await q(ANON, `select portal_submit($1, true)`, [TOKEN]);
  const r = await one(U.c1, `select q.status, q.submitted_via, q.consent_at, p.status ps from project_questionnaires q join client_projects p on p.id=q.project_id where p.id=$1`, [P1]);
  eq(r.status, 'recu'); eq(r.submitted_via, 'client'); eq(r.ps, 'questionnaire_recu');
  if (!r.consent_at) throw new Error('consentement non horodaté');
});
await rejects('après transmission : le client ne modifie plus', () => q(ANON, `select portal_save($1, '{"ville":"Paris"}'::jsonb)`, [TOKEN]));
await rejects('après transmission : le commercial non plus', () => q(U.c1, `select project_save_answers($1, '{"ville":"Paris"}'::jsonb)`, [P1]));
await ok('après transmission : l\'admin corrige (tracé)', async () => {
  await q(U.admin, `select project_save_answers($1, '{"ville":"Toulouse Centre"}'::jsonb)`, [P1]);
  eq((await one(U.admin, `select count(*)::int n from project_events where project_id=$1 and kind='modification'`, [P1])).n, 1);
});
await ok('après transmission : le client peut encore envoyer des documents', async () => {
  await q(ANON, `select portal_file_begin($1, 'photos_prestations', 'soin.webp', 'image/webp', 2000)`, [TOKEN]);
});

console.log('\nInformations manquantes');
await ok('demande de compléments : questionnaire rouvert, message visible par le client', async () => {
  await q(U.c1, `select flag_missing_info($1, 'Merci d''ajouter vos tarifs')`, [P1]);
  const r = (await one(ANON, `select portal_open($1) r`, [TOKEN])).r;
  eq(r.questionnaire.status, 'en_cours'); eq(r.missing_message, 'Merci d\'ajouter vos tarifs');
  eq((await one(U.c1, `select status from client_projects where id=$1`, [P1])).status, 'en_attente_infos');
});
await ok('le client complète et retransmet', async () => {
  await q(ANON, `select portal_save($1, '{"tarifs":"Soin visage 45 €"}'::jsonb)`, [TOKEN]);
  await q(ANON, `select portal_submit($1, true)`, [TOKEN]);
  eq((await one(U.c1, `select status from client_projects where id=$1`, [P1])).status, 'questionnaire_recu');
  eq((await one(ANON, `select portal_open($1) r`, [TOKEN])).r.missing_message, null);
});

console.log('\nBrief et production (admin)');
await rejects('commercial : changement de statut refusé', () => q(U.c1, `select set_project_status($1, 'en_creation')`, [P1]));
await rejects('commercial : enregistrement du brief refusé', () => q(U.c1, `select save_project_brief($1, '# Brief')`, [P1]));
let B1;
await ok('brief généré → version 1, statut « brief à valider »', async () => {
  B1 = (await one(U.admin, `select save_project_brief($1, '# Brief Salon Léa') id`, [P1])).id;
  eq((await one(U.admin, `select status from client_projects where id=$1`, [P1])).status, 'brief_a_valider');
  eq((await one(U.admin, `select version from project_briefs where id=$1`, [B1])).version, 1);
});
await ok('nouvelle génération → version 2', async () => {
  await q(U.admin, `select save_project_brief($1, '# Brief v2')`, [P1]);
  eq((await one(U.admin, `select max(version)::int v from project_briefs where project_id=$1`, [P1])).v, 2);
});
await ok('brief validé → prêt à produire, livraison prévue à J+10', async () => {
  await q(U.admin, `select validate_project_brief($1)`, [B1]);
  const r = await one(U.admin, `select status, target_date::text t, (current_date + 10)::text e, scope_validated_at from client_projects where id=$1`, [P1]);
  eq(r.status, 'pret_a_produire'); eq(r.t, r.e);
});
await ok('en création → contrat « site en cours »', async () => {
  await q(U.admin, `select set_project_status($1, 'en_creation')`, [P1]);
  eq((await one(U.admin, `select site_status from contracts where id=$1`, [K1])).site_status, 'en_cours');
});
await ok('tâches de production : l\'admin les gère, le commercial les voit', async () => {
  await q(U.admin, `insert into project_tasks (project_id, title, position) values ($1, 'Maquette', 1), ($1, 'Mise en ligne', 2)`, [P1]);
  eq((await q(U.c1, `select id from project_tasks where project_id=$1`, [P1])).length, 2);
});
await ok('commercial : modification d\'une tâche sans effet (RLS)', async () => {
  eq((await q(U.c1, `update project_tasks set title='x' where project_id=$1 returning id`, [P1])).length, 0);
});
await rejects('commercial : création de tâche refusée', () =>
  q(U.c1, `insert into project_tasks (project_id, title) values ($1, 'x')`, [P1]));
await ok('en validation client → contrat « en validation » + notification au commercial', async () => {
  await q(U.admin, `select set_project_status($1, 'en_validation_client')`, [P1]);
  eq((await one(U.admin, `select site_status from contracts where id=$1`, [K1])).site_status, 'en_validation');
  eq((await one(U.c1, `select count(*)::int n from notifications where project_id=$1 and kind='statut'`, [P1])).n, 1);
});
await rejects('livré sans adresse du site : refusé', () => q(U.admin, `select set_project_status($1, 'livre')`, [P1]));
await ok('livré → contrat en ligne et activé, liens client révoqués', async () => {
  await q(U.admin, `select set_project_status($1, 'livre', null, 'https://salon-lea.fr')`, [P1]);
  const k = await one(U.admin, `select site_status, status, activated_at from contracts where id=$1`, [K1]);
  eq(k.site_status, 'en_ligne'); eq(k.status, 'actif');
  if (!k.activated_at) throw new Error('contrat non activé');
  eq((await one(U.admin, `select count(*)::int n from project_access_tokens where project_id=$1 and revoked_at is null`, [P1])).n, 0);
});
await rejects('lien client inutilisable après livraison', () => q(ANON, `select portal_open($1)`, [TOKEN]));
await rejects('projet livré : statut définitif', () => q(U.admin, `select set_project_status($1, 'en_creation')`, [P1]));

console.log('\nRévocation, expiration, annulation');
let T2;
await ok('révocation manuelle d\'un lien', async () => {
  T2 = (await one(U.c2, `select create_project_link($1) r`, [P2])).r.token;
  await q(ANON, `select portal_open($1)`, [T2]);
  eq((await one(U.c2, `select revoke_project_links($1) n`, [P2])).n, 1);
});
await rejects('lien révoqué refusé', () => q(ANON, `select portal_open($1)`, [T2]));
await ok('lien expiré refusé', async () => {
  const t = (await one(U.c2, `select create_project_link($1) r`, [P2])).r.token;
  await asOwner(db, `update project_access_tokens set expires_at = now() - interval '1 minute' where project_id='${P2}' and revoked_at is null`);
  let refused = false;
  try { await q(ANON, `select portal_open($1)`, [t]); } catch { refused = true; }
  if (!refused) throw new Error('lien expiré accepté');
});
await rejects('annulation sans motif refusée', () => q(U.admin, `select set_project_status($1, 'annule')`, [P2]));
await ok('annulation avec motif → nouveau projet possible sur le contrat', async () => {
  await q(U.admin, `select set_project_status($1, 'annule', 'Client injoignable')`, [P2]);
  await q(U.c2, `select create_client_project($1)`, [K2]);
});

console.log('\nRetards et notifications');
await ok('projet en retard signalé', async () => {
  const P3 = (await one(U.c2, `select id from client_projects where contract_id=$1 and status<>'annule'`, [K2])).id;
  await q(U.admin, `select update_project($1, '{"target_date":"2026-01-05"}'::jsonb)`, [P3]);
  eq((await one(U.admin, `select is_late from project_overview where id=$1`, [P3])).is_late, true);
  eq((await one(U.admin, `select is_late from project_overview where id=$1`, [P1])).is_late, false);
});
await ok('chacun ne lit que ses notifications, marquage « lu »', async () => {
  const mine = await q(U.c1, `select user_id from notifications`);
  if (!mine.length || mine.some((n) => n.user_id !== U.c1)) throw new Error('notifications d\'un autre utilisateur');
  await q(U.c1, `select mark_notifications_read()`);
  eq((await one(U.c1, `select count(*)::int n from notifications where read_at is null`)).n, 0);
  if ((await one(U.admin, `select count(*)::int n from notifications where read_at is null`)).n === 0) throw new Error('admin marqué lu');
});
await ok('aucun email simulé : statut « non envoyé »', async () =>
  eq((await one(U.admin, `select count(*)::int n from notifications where email_status <> 'non_envoye'`)).n, 0));

process.exit(done() ? 1 : 0);
