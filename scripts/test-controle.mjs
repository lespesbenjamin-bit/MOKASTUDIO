// Vérifie que le script de contrôle Supabase (supabase/tests/controle-securite.sql)
// s'exécute et conclut « n/n OK » sur PostgreSQL embarqué, sans rien laisser en base.
import { readFileSync } from 'node:fs';
import { createDb } from './db-harness.mjs';

const db = await createDb({ log: false });
await db.exec('grant anon, authenticated to postgres'); // comme le rôle postgres de Supabase
const sql = readFileSync(new URL('../supabase/tests/controle-securite.sql', import.meta.url), 'utf8');
let msg = '';
try { await db.exec(sql); } catch (e) { msg = e.message; }
console.log(msg);
const leftover = Number((await db.query(`select count(*) c from profiles`)).rows[0].c);
const ok = /CONTRÔLE TERMINÉ — (\d+)\/\1 OK/.test(msg) && leftover === 0;
console.log(ok ? '\n1 vérifications OK, 0 en échec' : `\n0 vérifications OK, 1 en échec (profils restants : ${leftover})`);
process.exit(ok ? 0 : 1);
