// Test de bout en bout du PORTAIL CLIENT avec la vraie base :
// navigateur réel → application compilée → supabase-js → fonctions SQL portal_*
// exécutées sur PostgreSQL embarqué (mêmes migrations que Supabase), en tant
// qu'utilisateur anonyme. Vérifie sauvegarde automatique, reprise, envoi.
// Usage : npm run test:e2e-portal
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { createDb, as } from './db-harness.mjs';

const SUPA = 'https://portail-test.supabase.co';
const PORT = 4330;
const BASE = `http://localhost:${PORT}`;
let pass = 0, fail = 0;
async function check(label, fn) {
  try { await fn(); pass++; console.log(`  ✓ ${label}`); }
  catch (e) { fail++; console.log(`  ✗ ${label} → ${e.message.split('\n')[0]}`); }
}
const eq = (a, b) => { if (a !== b) throw new Error(`attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`); };

// 1. Base : un client signé, un projet, un lien
const db = await createDb({ log: false });
const U = { admin: 'a0000000-0000-0000-0000-000000000001', c1: 'c0000000-0000-0000-0000-000000000001' };
await db.exec(`insert into auth.users values ('${U.admin}','a@m.t'),('${U.c1}','c1@m.t')`);
await db.exec(`set role app_owner; insert into profiles (id, role, full_name, email, is_active) values
  ('${U.admin}','admin','Benjamin','a@m.t',true), ('${U.c1}','commercial','Camille','c1@m.t',true); reset role;`);
const one = async (who, sql, p) => (await as(db, who, sql, p)).rows[0];
const L1 = (await one(U.c1, `select create_lead($1::jsonb, $2::jsonb) id`, [
  JSON.stringify({ name: 'Salon Léa', sector: 'Institut de beauté', city: 'Toulouse', postal_code: '31000' }),
  JSON.stringify({ first_name: 'Léa', phone: '06 11 22 33 44', email: 'lea@salon-lea.fr' })])).id;
const K1 = (await one(U.c1, `select convert_lead_to_customer($1, 'abonnement') id`, [L1])).id;
const P1 = (await one(U.c1, `select create_client_project($1) id`, [K1])).id;
const TOKEN = (await one(U.c1, `select create_project_link($1) r`, [P1])).r.token;

// 2. Application compilée avec une adresse Supabase de test (interceptée)
console.log('Compilation de l’application de test…');
const build = spawnSync('npx', ['vite', 'build', '--outDir', 'dist-portal-test', '--emptyOutDir', '--logLevel', 'error'], {
  stdio: 'inherit', env: { ...process.env, VITE_SUPABASE_URL: SUPA, VITE_SUPABASE_ANON_KEY: 'cle-anon-test' },
});
if (build.status !== 0) process.exit(1);
const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-portal-test', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });

// 3. Faux PostgREST : chaque appel RPC devient un appel SQL anonyme réel
const TYPES = { p_token: 'text', p_patch: 'jsonb', p_step: 'integer', p_completion: 'integer', p_consent: 'boolean', p_file_id: 'uuid' };
const ALLOWED = new Set(['portal_open', 'portal_save', 'portal_submit']);
const rpcCalls = [];
async function handle(route) {
  const req = route.request();
  const url = new URL(req.url());
  const m = url.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/);
  if (!m) return route.fulfill({ status: 404, contentType: 'application/json', body: '{"message":"non simulé"}' });
  const name = m[1];
  if (!ALLOWED.has(name)) return route.fulfill({ status: 404, contentType: 'application/json', body: '{"message":"fonction non exposée"}' });
  const body = req.postDataJSON() ?? {};
  rpcCalls.push({ name, body, auth: req.headers()['authorization'] });
  const keys = Object.keys(body);
  const args = keys.map((k, i) => `${k} => $${i + 1}::${TYPES[k] ?? 'text'}`).join(', ');
  const params = keys.map((k) => (TYPES[k] === 'jsonb' ? JSON.stringify(body[k]) : body[k]));
  try {
    const r = await as(db, null, `select public.${name}(${args}) as r`, params);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r.rows[0].r ?? null) });
  } catch (e) {
    return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: e.message, code: e.code ?? 'P0001' }) });
  }
}

const qState = async () => (await one(U.admin, `select q.status, q.answers, q.completion_pct, p.status as project_status
  from project_questionnaires q join client_projects p on p.id = q.project_id where q.project_id = $1`, [P1]));

try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) break; } catch { /* démarrage */ } await new Promise((r) => setTimeout(r, 500)); }
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); // téléphone
  await ctx.route(`${SUPA}/**`, handle);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  console.log('\nPortail client (base réelle, téléphone)');
  await check('le lien ouvre l’accueil du bon projet, prérempli', async () => {
    await page.goto(`${BASE}/projet/${TOKEN}`);
    await page.getByRole('heading', { name: /Créons ensemble un site qui vous/ }).waitFor({ timeout: 10000 });
    await page.getByText('Salon Léa').first().waitFor();
    await page.getByRole('button', { name: 'Commencer' }).click();
    eq(await page.getByLabel('Nom commercial').inputValue(), 'Salon Léa');
    eq(await page.getByLabel('Téléphone à afficher sur le site').inputValue(), '06 11 22 33 44');
  });
  await check('appels faits avec la clé anonyme uniquement', async () => {
    if (!rpcCalls.length || rpcCalls.some((c) => !String(c.auth).includes('cle-anon-test'))) throw new Error('en-tête inattendu');
  });
  await check('sauvegarde automatique pendant la saisie', async () => {
    await page.getByLabel('Instagram').fill('@salonlea');
    await page.getByText(/Enregistré à/).waitFor({ timeout: 8000 });
    const s = await qState();
    eq(s.answers.instagram, '@salonlea'); eq(s.status, 'en_cours');
  });
  await check('« Enregistrer et continuer plus tard » puis reprise au même endroit', async () => {
    await page.getByRole('button', { name: 'Suivant' }).click(); // étape 2
    await page.getByRole('radio', { name: 'Non' }).first().click();
    await page.getByRole('button', { name: 'Enregistrer et continuer plus tard' }).click();
    await page.getByRole('heading', { name: 'Vos réponses sont enregistrées' }).waitFor();
    await page.reload();
    await page.getByText('Votre futur site internet').first().waitFor({ timeout: 8000 }); // reprise directe à l'étape 2
    eq((await qState()).answers.site_existant, 'non');
  });
  await check('choix multiples et champ conditionnel enregistrés', async () => {
    await page.getByRole('button', { name: 'Recevoir des demandes de contact' }).click();
    await page.getByRole('button', { name: 'Autre' }).first().click();
    await page.getByLabel('Autre objectif').fill('Vendre des cartes cadeaux');
    await page.getByText(/Enregistré à/).waitFor({ timeout: 8000 });
    await new Promise((r) => setTimeout(r, 1500));
    const a = (await qState()).answers;
    eq(JSON.stringify(a.objectifs), JSON.stringify(['contact', 'autre'])); eq(a.objectifs_autre, 'Vendre des cartes cadeaux');
  });
  await check('récapitulatif : informations manquantes listées, envoi bloqué sans confirmation', async () => {
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Suivant' }).click();
    await page.getByRole('button', { name: 'Vérifier' }).click();
    await page.getByText(/Informations manquantes \(\d+\)/).waitFor();
    if (await page.getByRole('button', { name: 'Transmettre mon projet à Moka Studio' }).isEnabled()) throw new Error('envoi possible');
  });
  await check('transmission → « Questionnaire reçu » dans le CRM, notifications créées', async () => {
    await page.getByText(/Je confirme que les informations transmises sont exactes/).click();
    await page.getByRole('button', { name: 'Transmettre mon projet à Moka Studio' }).click();
    await page.getByRole('heading', { name: 'Merci !' }).waitFor({ timeout: 8000 });
    await page.getByText(/Votre projet est maintenant entre les mains de Moka Studio/).waitFor();
    const s = await qState();
    eq(s.status, 'recu'); eq(s.project_status, 'questionnaire_recu');
    const n = await one(U.c1, `select count(*)::int n from notifications where project_id = $1 and kind = 'questionnaire_recu'`, [P1]);
    eq(n.n, 1);
  });
  await check('après envoi, le lien n’autorise plus la modification des réponses', async () => {
    await page.reload();
    await page.getByRole('heading', { name: 'Merci !' }).waitFor({ timeout: 8000 });
    let refused = false;
    try { await as(db, null, `select portal_save($1, '{"instagram":"@pirate"}'::jsonb)`, [TOKEN]); } catch { refused = true; }
    eq(refused, true);
  });
  await check('lien révoqué → page « Lien indisponible »', async () => {
    await as(db, U.c1, `select revoke_project_links($1)`, [P1]);
    await page.reload();
    await page.getByRole('heading', { name: 'Lien indisponible' }).waitFor({ timeout: 8000 });
  });
  await check('aucune erreur JavaScript', async () => { if (errors.length) throw new Error(errors.join(' | ')); });
  await browser.close();
} catch (e) {
  fail++; console.error(e);
} finally {
  server.kill();
  spawnSync('rm', ['-rf', 'dist-portal-test']);
}
console.log(`\n${pass} vérifications OK, ${fail} en échec`);
process.exit(fail ? 1 : 0);
