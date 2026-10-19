// Tests de bout en bout dans un vrai navigateur, sur le mode démonstration
// (aucune base nécessaire). Parcourt toutes les pages pour chaque rôle et
// vérifie : pas d'erreur JavaScript, titres attendus, droits de navigation,
// écritures refusées en démo.
// Usage : npm run build && npm run test:e2e
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const PORT = 4300;
const BASE = `http://localhost:${PORT}`;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
let pass = 0, fail = 0;

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(BASE)).ok) return; } catch { /* pas encore prêt */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Serveur de prévisualisation indisponible');
}

async function check(label, fn) {
  try { await fn(); pass++; console.log(`  ✓ ${label}`); }
  catch (e) { fail++; console.log(`  ✗ ${label} → ${e.message.split('\n')[0]}`); }
}

const PAGES = {
  admin: [
    ['/', /Bonjour|Bonsoir/], ['/tableau-de-bord', /Tableau de bord/], ['/prospects', /Prospects/], ['/prospects/l05', /Fleuriste Pétales/],
    ['/relances', /relances/i], ['/clients', /Clients & contrats/], ['/clients/k1', /Pizzeria Bella/], ['/paiements', /Paiements/],
    ['/commissions', /Commissions/], ['/finances', /prévisionnel/], ['/parametres', /Paramètres/], ['/parametres/utilisateurs', /Utilisateurs/],
    ['/mon-profil', /Mon profil/], ['/carte', /Carte/],
  ],
  commercial: [['/', /Bonjour|Bonsoir/], ['/prospects', /Prospects/], ['/carte', /Carte/], ['/relances', /Mes relances/], ['/clients', /Clients/], ['/commissions', /Mes commissions/]],
  apporteur: [['/', /Bonjour|Bonsoir/], ['/apports', /prospects transmis/], ['/commissions', /Mes commissions/]],
};
const FORBIDDEN = { commercial: ['/parametres', '/tableau-de-bord', '/paiements'], apporteur: ['/prospects', '/clients', '/parametres', '/carte'] };

try {
  await waitForServer();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

  for (const role of ['admin', 'commercial', 'apporteur']) {
    console.log(`\nRôle : ${role}`);
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${BASE}/demo`);
    await page.evaluate((r) => sessionStorage.setItem('moka-demo-role', r), role);
    await page.goto(`${BASE}/`);

    for (const [path, title] of PAGES[role]) {
      await check(`${path} s'affiche`, async () => {
        await page.goto(BASE + path);
        await page.getByRole('heading', { level: 1, name: title }).first().waitFor({ timeout: 8000 });
        if (!(await page.getByText('Démonstration — données fictives').isVisible())) throw new Error('bandeau démo absent');
      });
    }
    for (const path of FORBIDDEN[role] ?? []) {
      await check(`${path} refusé`, async () => {
        await page.goto(BASE + path);
        await page.getByRole('heading', { name: 'Accès réservé' }).waitFor({ timeout: 5000 });
      });
    }
    await check('aucune erreur JavaScript', async () => { if (errors.length) throw new Error(errors.join(' | ')); });
    await ctx.close();
  }

  console.log('\nÉcritures en démonstration');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/demo`);
  await page.evaluate(() => sessionStorage.setItem('moka-demo-role', 'admin'));
  await check('créer un prospect affiche « aucune modification enregistrée »', async () => {
    await page.goto(`${BASE}/prospects`);
    await page.getByRole('button', { name: 'Nouveau prospect' }).click();
    await page.getByLabel('Nom de l’entreprise *').fill('Test démo');
    await page.getByRole('button', { name: 'Créer le prospect' }).click();
    await page.getByText(/Mode démonstration : aucune modification/).waitFor({ timeout: 5000 });
  });
  console.log('\nCarte et tournée');
  const mapErrors = [];
  page.on('pageerror', (e) => mapErrors.push(e.message));
  await check('épingles et regroupements affichés', async () => {
    await page.goto(`${BASE}/carte`);
    await page.locator('.moka-pin, .moka-cluster').first().waitFor({ timeout: 8000 });
  });
  await check('les perdus sont masqués par défaut, réaffichables via la légende', async () => {
    const perdu = page.getByRole('button', { name: /^Perdu/ });
    if ((await perdu.getAttribute('aria-pressed')) !== 'false') throw new Error('Perdu affiché par défaut');
    await perdu.click();
    if ((await perdu.getAttribute('aria-pressed')) !== 'true') throw new Error('bascule inopérante');
  });
  await check('liste des entreprises non localisées', async () => {
    await page.getByRole('button', { name: /non localisé/ }).click();
    await page.getByText('Food-truck Le Nomade (fictif)').waitFor({ timeout: 3000 });
    await page.keyboard.press('Escape');
  });
  await check('construire une tournée de 3 arrêts → lien Google Maps', async () => {
    await page.evaluate(() => localStorage.removeItem('moka.map.tour'));
    await page.goto(`${BASE}/carte`);
    // Clients seulement : zoom serré pour éviter les regroupements
    await page.getByRole('radio', { name: 'Clients' }).click();
    for (let i = 0; i < 3; i++) {
      await page.locator('.leaflet-marker-icon:has(.moka-pin)').first().dispatchEvent('click');
      await page.getByRole('button', { name: 'Ajouter à la tournée' }).click();
    }
    await page.locator('.moka-stop').nth(2).waitFor({ timeout: 3000 });
    const href = await page.getByRole('link', { name: /Google Maps/ }).last().getAttribute('href');
    if (!href?.startsWith('https://www.google.com/maps/dir/?api=1') || !href.includes('waypoints=')) throw new Error(`lien inattendu : ${href}`);
  });
  await check('carte sans erreur JavaScript', async () => { if (mapErrors.length) throw new Error(mapErrors.join(' | ')); });

  await check('quitter la démo ramène à la connexion', async () => {
    await page.goto(`${BASE}/`);
    await page.getByRole('button', { name: 'Quitter la démo' }).click();
    await page.waitForURL(/\/connexion/);
  });
  await browser.close();
} catch (e) {
  fail++;
  console.error(e);
} finally {
  server.kill();
}
console.log(`\n${pass} vérifications OK, ${fail} en échec`);
process.exit(fail ? 1 : 0);
