// Banc d'essai PostgreSQL embarqué (PGlite) qui imite Supabase :
//  - rôles anon / authenticated / service_role
//  - schéma auth avec auth.users et auth.uid()
//  - objets créés par un propriétaire SANS bypassrls (cas le plus strict)
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations');

export async function createDb({ log = true } = {}) {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create role app_owner nologin nobypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated, service_role, app_owner;
    grant select, references on auth.users to app_owner;
    grant usage, create on schema public to app_owner;
    grant usage on schema public to anon, authenticated, service_role;
  `);
  await db.exec('set role app_owner');
  for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    try {
      await db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));
      if (log) console.log(`✓ migration ${f}`);
    } catch (e) {
      console.error(`✗ migration ${f}: ${e.message}`);
      process.exit(1);
    }
  }
  // service_role doit voir les tables comme dans Supabase
  await db.exec(`grant all on all tables in schema public to service_role;
                 grant usage, select on all sequences in schema public to service_role;`);
  await db.exec('reset role');
  return db;
}

/** Exécute une requête en se faisant passer pour un utilisateur (uid) ou anon (null). */
export async function as(db, who, sql, params) {
  const role = who === 'service' ? 'service_role' : who ? 'authenticated' : 'anon';
  const uid = who && who !== 'service' ? who : '';
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role ${role};`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

/** Exécute en tant que propriétaire (équivaut au SQL Editor de Supabase). */
export async function asOwner(db, sql) {
  await db.exec('set role app_owner');
  try { return await db.exec(sql); } finally { await db.exec('reset role'); }
}

export function makeChecker() {
  const state = { pass: 0, fail: 0 };
  const ok = async (label, fn) => {
    try { await fn(); state.pass++; console.log(`  ✓ ${label}`); }
    catch (e) { state.fail++; console.log(`  ✗ ${label} → ${e.message}`); }
  };
  const rejects = async (label, fn) => {
    try { await fn(); state.fail++; console.log(`  ✗ ${label} → aurait dû être refusé`); }
    catch (e) { state.pass++; console.log(`  ✓ ${label} (refusé : ${e.message.split('\n')[0].slice(0, 70)})`); }
  };
  const eq = (a, b) => { if (a !== b) throw new Error(`attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`); };
  const done = () => {
    console.log(`\n${state.pass} vérifications OK, ${state.fail} en échec`);
    return state.fail;
  };
  return { ok, rejects, eq, done };
}
