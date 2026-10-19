// Lance le test d'intégration des Edge Functions si Deno est disponible
// (variable DENO_PATH, ou « deno » dans le PATH). Sinon, l'indique sans échouer.
import { spawnSync } from 'node:child_process';

const deno = process.env.DENO_PATH || 'deno';
const probe = spawnSync(deno, ['--version'], { stdio: 'ignore' });
if (probe.error || probe.status !== 0) {
  console.log('Deno introuvable : test des Edge Functions ignoré (installez Deno ou définissez DENO_PATH).');
  process.exit(0);
}
const check = spawnSync(deno, ['check', 'supabase/functions/project-files/index.ts', 'supabase/functions/admin-users/index.ts'], { stdio: 'inherit' });
if (check.status !== 0) process.exit(check.status ?? 1);
const run = spawnSync(deno, ['run', '-A', 'scripts/test-edge-files.ts'], { stdio: 'inherit' });
process.exit(run.status ?? 1);
