// Test d'intégration de l'Edge Function « project-files » avec Deno.
// Un faux Supabase (API REST + stockage) tourne en local ; la fonction est
// exécutée telle qu'elle sera déployée, avec la vraie bibliothèque supabase-js.
// Usage : deno run -A scripts/test-edge-files.ts   (ou npm run test:edge)

const MOCK_PORT = 54400;
const TOKEN = 'a'.repeat(64);
const PDF = new TextEncoder().encode('%PDF-1.7\n1 0 obj\n');
const FAKE = new TextEncoder().encode('<html><script>alert(1)</script></html>');

type Call = { method: string; path: string; body?: unknown; auth?: string | null };
const calls: Call[] = [];
const storage = new Map<string, Uint8Array>();
const files = new Map<string, { id: string; storage_path: string; mime_type: string; status: string }>();
let seq = 0;

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const mock = Deno.serve({ port: MOCK_PORT, onListen: () => {} }, async (req) => {
  const u = new URL(req.url);
  const raw = req.method === 'GET' || req.method === 'HEAD' ? null : new Uint8Array(await req.arrayBuffer());
  let body: unknown = null;
  try { body = raw ? JSON.parse(new TextDecoder().decode(raw)) : null; } catch { body = raw; }
  calls.push({ method: req.method, path: u.pathname, body, auth: req.headers.get('Authorization') });

  // --- Auth (session de l'équipe) ---
  if (u.pathname === '/auth/v1/user') {
    return req.headers.get('Authorization') === 'Bearer team-jwt'
      ? json(200, { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 't@m.t' })
      : json(401, { msg: 'invalid' });
  }
  // --- RPC ---
  const rpc = u.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/)?.[1];
  if (rpc) {
    const b = body as Record<string, unknown>;
    if (rpc === 'portal_file_begin' || rpc === 'project_file_begin') {
      if (rpc === 'portal_file_begin' && b.p_token !== TOKEN) return json(401, { code: '28000', message: 'Ce lien n’est pas valide ou a expiré.' });
      if (rpc === 'project_file_begin' && req.headers.get('Authorization') !== 'Bearer team-jwt') return json(403, { message: 'Projet introuvable ou accès refusé' });
      const id = `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
      const path = `11111111-1111-4111-8111-111111111111/${id}.pdf`;
      files.set(id, { id, storage_path: path, mime_type: String(b.p_mime), status: 'en_attente' });
      return json(200, { file_id: id, path });
    }
    if (rpc === 'portal_file_owned') {
      if (b.p_token !== TOKEN) return json(401, { message: 'Ce lien n’est pas valide ou a expiré.' });
      return json(200, files.has(String(b.p_file_id)));
    }
    if (rpc === 'project_file_owned') return json(200, req.headers.get('Authorization') === 'Bearer team-jwt' && files.has(String(b.p_file_id)));
    if (rpc === 'project_file_confirm') {
      const f = files.get(String(b.p_file_id));
      if (!f) return json(404, { message: 'Document introuvable' });
      if (b.p_ok) f.status = 'valide'; else files.delete(f.id);
      return json(200, null);
    }
    if (rpc === 'portal_file_delete') {
      if (b.p_token !== TOKEN) return json(401, { message: 'Ce lien n’est pas valide ou a expiré.' });
      const f = files.get(String(b.p_file_id));
      if (!f) return json(404, { message: 'Document introuvable' });
      files.delete(f.id);
      return json(200, f.storage_path);
    }
    return json(404, { message: `rpc inconnue ${rpc}` });
  }
  // --- Table project_files (lecture par la clé service) ---
  if (u.pathname === '/rest/v1/project_files') {
    const id = (u.searchParams.get('id') ?? '').replace(/^eq\./, '');
    const rows = files.has(id) ? [files.get(id)] : [];
    return (req.headers.get('Accept') ?? '').includes('vnd.pgrst.object')
      ? (rows.length ? json(200, rows[0]) : json(406, { code: 'PGRST116', message: 'no rows' }))
      : json(200, rows);
  }
  // --- Stockage ---
  const sign = u.pathname.match(/^\/storage\/v1\/object\/upload\/sign\/project-files\/(.+)$/);
  if (sign && req.method === 'POST') return json(200, { url: `/object/upload/sign/project-files/${sign[1]}?token=up-token` });
  const obj = u.pathname.match(/^\/storage\/v1\/object\/(?:authenticated\/)?project-files\/(.+)$/);
  if (obj && req.method === 'GET') {
    const data = storage.get(decodeURIComponent(obj[1]!));
    return data ? new Response(data, { status: 200 }) : json(404, { message: 'Object not found' });
  }
  if (u.pathname === '/storage/v1/object/project-files' && req.method === 'DELETE') {
    for (const p of ((body as { prefixes: string[] }).prefixes ?? [])) storage.delete(p);
    return json(200, []);
  }
  return json(404, { message: `introuvable ${req.method} ${u.pathname}` });
});

Deno.env.set('SUPABASE_URL', `http://localhost:${MOCK_PORT}`);
Deno.env.set('SUPABASE_ANON_KEY', 'anon-key');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
await import('../supabase/functions/project-files/index.ts'); // démarre Deno.serve sur le port 8000

const FN = 'http://localhost:8000';
const call = async (body: unknown, auth?: string) => {
  const r = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) as Record<string, unknown> | null };
};

let pass = 0, fail = 0;
async function check(label: string, fn: () => Promise<void>) {
  try { await fn(); pass++; console.log(`  ✓ ${label}`); } catch (e) { fail++; console.log(`  ✗ ${label} → ${(e as Error).message}`); }
}
const eq = (a: unknown, b: unknown) => { if (a !== b) throw new Error(`attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`); };

console.log('Edge Function project-files (client par lien)');
let fileId = '', path = '';
await check('begin avec un lien valide → URL de dépôt signée', async () => {
  const r = await call({ action: 'begin', token: TOKEN, category: 'plaquette_tarifaire', name: 'tarifs.pdf', mime: 'application/pdf', size: PDF.length });
  eq(r.status, 200); eq(r.body?.upload_token, 'up-token');
  fileId = String(r.body?.file_id); path = String(r.body?.path);
  const signCall = calls.find((c) => c.path.startsWith('/storage/v1/object/upload/sign/'));
  eq(signCall?.auth, 'Bearer service-key'); // l'URL signée est demandée avec la clé serveur…
  const rpcCall = calls.find((c) => c.path === '/rest/v1/rpc/portal_file_begin');
  eq(rpcCall?.auth, 'Bearer anon-key'); // …mais le contrôle du lien se fait SANS elle
});
await check('begin avec un jeton mal formé → refusé sans appel à la base', async () => {
  const n = calls.length;
  const r = await call({ action: 'begin', token: 'x', category: 'logo', name: 'a.png', mime: 'image/png', size: 10 });
  eq(r.status, 403); eq(calls.length, n);
});
await check('begin avec un lien inconnu → refusé par la base', async () => {
  const r = await call({ action: 'begin', token: 'b'.repeat(64), category: 'logo', name: 'a.png', mime: 'image/png', size: 10 });
  eq(r.status, 400); eq(r.body?.error, 'Ce lien n’est pas valide ou a expiré.');
});
await check('confirm : vrai PDF → validé', async () => {
  storage.set(path, PDF);
  const r = await call({ action: 'confirm', token: TOKEN, file_id: fileId });
  eq(r.status, 200); eq(files.get(fileId)?.status, 'valide');
});
await check('confirm : faux PDF (page HTML) → refusé et supprimé du stockage', async () => {
  const b = await call({ action: 'begin', token: TOKEN, category: 'autres', name: 'piege.pdf', mime: 'application/pdf', size: FAKE.length });
  const id = String(b.body?.file_id), p = String(b.body?.path);
  storage.set(p, FAKE);
  const r = await call({ action: 'confirm', token: TOKEN, file_id: id });
  eq(r.status, 422); eq(files.has(id), false); eq(storage.has(p), false);
});
await check('confirm : fichier jamais déposé → refusé', async () => {
  const b = await call({ action: 'begin', token: TOKEN, category: 'logo', name: 'a.pdf', mime: 'application/pdf', size: 10 });
  const r = await call({ action: 'confirm', token: TOKEN, file_id: String(b.body?.file_id) });
  eq(r.status, 422);
});
await check('confirm avec un autre lien → refusé', async () => {
  const r = await call({ action: 'confirm', token: 'c'.repeat(64), file_id: fileId });
  eq(r.status, 403);
});
await check('confirm sans lien ni session → refusé', async () => {
  const r = await call({ action: 'confirm', file_id: fileId });
  eq(r.status, 401);
});
await check('delete par le client → retiré de la base et du stockage', async () => {
  const r = await call({ action: 'delete', token: TOKEN, file_id: fileId });
  eq(r.status, 200); eq(files.has(fileId), false); eq(storage.has(path), false);
});

console.log('\nEdge Function project-files (équipe connectée)');
await check('sans session valide → 401', async () => {
  const r = await call({ action: 'begin', project_id: '11111111-1111-4111-8111-111111111111', category: 'logo', name: 'a.png', mime: 'image/png', size: 10 }, 'Bearer nimporte-quoi');
  eq(r.status, 401);
});
await check('avec session → begin via project_file_begin (droits vérifiés en base)', async () => {
  const r = await call({ action: 'begin', project_id: '11111111-1111-4111-8111-111111111111', category: 'logo', name: 'a.pdf', mime: 'application/pdf', size: 10 }, 'Bearer team-jwt');
  eq(r.status, 200);
  eq(calls.filter((c) => c.path === '/rest/v1/rpc/project_file_begin').at(-1)?.auth, 'Bearer team-jwt');
});
await check('avec session → confirm vérifie l’accès au projet', async () => {
  const b = await call({ action: 'begin', project_id: '11111111-1111-4111-8111-111111111111', category: 'logo', name: 'b.pdf', mime: 'application/pdf', size: PDF.length }, 'Bearer team-jwt');
  storage.set(String(b.body?.path), PDF);
  const r = await call({ action: 'confirm', file_id: String(b.body?.file_id) }, 'Bearer team-jwt');
  eq(r.status, 200); eq(files.get(String(b.body?.file_id))?.status, 'valide');
});
await check('action inconnue / méthode GET refusées', async () => {
  eq((await call({ action: 'pirater', token: TOKEN })).status, 400);
  eq((await fetch(FN)).status, 405);
});

console.log(`\n${pass} vérifications OK, ${fail} en échec`);
await mock.shutdown();
Deno.exit(fail ? 1 : 0);
