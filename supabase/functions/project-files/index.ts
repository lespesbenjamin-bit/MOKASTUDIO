// Edge Function « project-files » — dépôt et suppression des documents d'un projet.
//
// Utilisée par :
//   * le client, sans compte, avec son jeton de lien (champ « token ») ;
//   * l'équipe connectée (en-tête Authorization de la session).
//
// Actions (POST JSON) :
//   { action: "begin",   token? | project_id?, category, name, mime, size }
//        → contrôle des droits + format + taille en base, puis URL de dépôt signée
//   { action: "confirm", token? , file_id }
//        → le serveur relit le fichier déposé et vérifie son VRAI type (signature
//          binaire) avant de le rendre visible ; sinon il est supprimé
//   { action: "delete",  token? , file_id }
//
// La clé SERVICE_ROLE ne sert qu'au stockage et à la confirmation, APRÈS les
// contrôles faits en base par les fonctions portal_* / project_*.
//
// Déploiement : désactiver « Verify JWT » (le client n'a pas de compte ;
// les contrôles sont faits ici et en base).
// Variables fournies automatiquement : SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = 'project-files';
const MAX_BYTES = 10 * 1024 * 1024;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[0-9a-f]{64}$/;

// <sniff>
/** Type réel d'un fichier d'après ses premiers octets (null si non reconnu). */
export function sniffMime(b: Uint8Array): string | null {
  const at = (i: number, bytes: number[]) => bytes.every((x, k) => b[i + k] === x);
  if (b.length >= 3 && at(0, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (b.length >= 8 && at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (b.length >= 12 && at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50])) return 'image/webp';
  // PDF : « %PDF- » dans les 1 024 premiers octets (tolère un préambule)
  for (let i = 0; i + 5 <= Math.min(b.length, 1024); i++) {
    if (at(i, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';
  }
  return null;
}
// </sniff>

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Méthode non autorisée' });

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) return json(500, { error: 'Configuration serveur incomplète' });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: 'Requête invalide' }); }

  const opts = { auth: { persistSession: false, autoRefreshToken: false } };
  const service = createClient(url, serviceKey, opts);
  const token = typeof body.token === 'string' ? body.token : null;
  if (token !== null && !TOKEN_RE.test(token)) return json(403, { error: 'Ce lien n’est pas valide ou a expiré.' });

  // Client « appelant » : le jeton du lien OU la session de l'équipe (la RLS s'applique)
  const caller = token
    ? createClient(url, anonKey, opts)
    : createClient(url, anonKey, { ...opts, global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  if (!token) {
    const { data, error } = await caller.auth.getUser();
    if (error || !data.user) return json(401, { error: 'Session invalide, reconnectez-vous' });
  }

  const fail = (e: { message?: string } | null, status = 400) => json(status, { error: e?.message ?? 'Erreur' });

  switch (body.action) {
    case 'begin': {
      const args = {
        p_category: String(body.category ?? ''),
        p_name: String(body.name ?? '').slice(0, 300),
        p_mime: String(body.mime ?? ''),
        p_size: Number(body.size ?? 0),
      };
      const res = token
        ? await caller.rpc('portal_file_begin', { p_token: token, ...args })
        : UUID_RE.test(String(body.project_id))
          ? await caller.rpc('project_file_begin', { p_project_id: body.project_id, ...args })
          : { data: null, error: { message: 'Projet invalide' } };
      if (res.error) return fail(res.error);
      const { file_id, path } = res.data as { file_id: string; path: string };
      const up = await service.storage.from(BUCKET).createSignedUploadUrl(path);
      if (up.error) {
        await service.rpc('project_file_confirm', { p_file_id: file_id, p_ok: false });
        return fail(up.error, 500);
      }
      return json(200, { file_id, path, upload_token: up.data.token });
    }

    case 'confirm': {
      if (!UUID_RE.test(String(body.file_id))) return json(400, { error: 'Document invalide' });
      // L'appelant doit avoir accès au projet du document (lien client ou équipe)
      const own = token
        ? await caller.rpc('portal_file_owned', { p_token: token, p_file_id: body.file_id })
        : await caller.rpc('project_file_owned', { p_file_id: body.file_id });
      if (own.error) return fail(own.error, 403);
      if (own.data !== true) return json(404, { error: 'Document introuvable' });
      const { data: f, error } = await service.from('project_files')
        .select('id, storage_path, mime_type, status').eq('id', body.file_id).maybeSingle();
      if (error || !f) return json(404, { error: 'Document introuvable' });
      if (f.status === 'valide') return json(200, { ok: true });

      const dl = await service.storage.from(BUCKET).download(f.storage_path);
      let ok = false;
      let reason = 'Fichier non reçu, merci de réessayer.';
      if (!dl.error && dl.data) {
        const bytes = new Uint8Array(await dl.data.arrayBuffer());
        const real = sniffMime(bytes);
        if (bytes.length === 0 || bytes.length > MAX_BYTES) reason = 'Taille du fichier non autorisée (10 Mo maximum).';
        else if (real !== f.mime_type) reason = 'Le contenu du fichier ne correspond pas à un JPG, PNG, WEBP ou PDF valide.';
        else ok = true;
      }
      const conf = await service.rpc('project_file_confirm', { p_file_id: f.id, p_ok: ok });
      if (conf.error) return fail(conf.error, 500);
      if (!ok) {
        await service.storage.from(BUCKET).remove([f.storage_path]);
        return json(422, { error: reason });
      }
      return json(200, { ok: true });
    }

    case 'delete': {
      if (!UUID_RE.test(String(body.file_id))) return json(400, { error: 'Document invalide' });
      const res = token
        ? await caller.rpc('portal_file_delete', { p_token: token, p_file_id: body.file_id })
        : await caller.rpc('project_file_delete', { p_file_id: body.file_id });
      if (res.error) return fail(res.error);
      await service.storage.from(BUCKET).remove([String(res.data)]);
      return json(200, { ok: true });
    }

    default:
      return json(400, { error: 'Action inconnue' });
  }
});
