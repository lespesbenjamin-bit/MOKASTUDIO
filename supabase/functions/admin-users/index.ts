// Edge Function « admin-users » — seule partie du système qui utilise la clé
// SERVICE_ROLE (jamais exposée au navigateur).
//
// Actions (POST JSON) :
//   { action: "invite",     email, full_name, role }   → invite + crée le profil
//   { action: "set_active", user_id, active }          → active / désactive (et bloque la connexion)
//   { action: "resend",     user_id }                  → renvoie l'invitation
//
// Contrôles : JWT valide + profil ADMIN ACTIF vérifié en base, côté serveur.
//
// Variables : SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// (fournies automatiquement par Supabase) + APP_URL (à définir, ex.
// https://moka-hub.vercel.app) pour le lien de l'email d'invitation.

import { createClient } from 'npm:@supabase/supabase-js@2';

const ROLES = ['admin', 'commercial', 'apporteur'] as const;
type Role = (typeof ROLES)[number];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BAN_FOREVER = '876000h'; // ~100 ans

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Méthode non autorisée' });

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const appUrl = (Deno.env.get('APP_URL') ?? '').replace(/\/+$/, '');
  if (!url || !anonKey || !serviceKey) return json(500, { error: 'Configuration serveur incomplète' });

  // 1. Qui appelle ? (client « utilisateur » : la RLS s'applique)
  const authHeader = req.headers.get('Authorization') ?? '';
  const asCaller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await asCaller.auth.getUser();
  if (userError || !userData.user) return json(401, { error: 'Session invalide, reconnectez-vous' });
  const caller = userData.user;

  const { data: isAdmin, error: roleError } = await asCaller.rpc('is_admin');
  if (roleError) return json(500, { error: 'Vérification du rôle impossible' });
  if (isAdmin !== true) return json(403, { error: 'Réservé aux administrateurs' });

  // 2. Client « service » : contourne la RLS, uniquement après contrôle admin
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Corps JSON invalide' });
  }

  switch (body.action) {
    case 'invite': {
      const email = String(body.email ?? '').trim().toLowerCase();
      const fullName = String(body.full_name ?? '').trim();
      const role = String(body.role ?? '') as Role;
      if (!EMAIL_RE.test(email)) return json(400, { error: 'Email invalide' });
      if (fullName.length < 1 || fullName.length > 120) return json(400, { error: 'Nom requis (120 caractères max.)' });
      if (!ROLES.includes(role)) return json(400, { error: 'Rôle invalide' });
      if (!appUrl) return json(500, { error: 'APP_URL non configurée sur la fonction' });

      const { data: existing } = await admin.from('profiles').select('id').eq('email', email).maybeSingle();
      if (existing) return json(409, { error: 'Un compte existe déjà avec cet email' });

      const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${appUrl}/definir-mot-de-passe`,
        data: { full_name: fullName },
      });
      if (inviteError || !invited.user) {
        const already = /already|registered|exists/i.test(inviteError?.message ?? '');
        return json(already ? 409 : 502, {
          error: already ? 'Cet email a déjà un compte d\'authentification' : `Invitation impossible : ${inviteError?.message}`,
        });
      }

      const { error: profileError } = await admin.from('profiles').insert({
        id: invited.user.id, role, full_name: fullName, email, is_active: true,
      });
      if (profileError) {
        // Pas de compte orphelin : on annule l'invitation
        await admin.auth.admin.deleteUser(invited.user.id);
        return json(500, { error: `Création du profil impossible : ${profileError.message}` });
      }
      return json(201, { id: invited.user.id, email, role });
    }

    case 'set_active': {
      const userId = String(body.user_id ?? '');
      const active = body.active === true;
      if (!UUID_RE.test(userId)) return json(400, { error: 'Identifiant invalide' });
      if (userId === caller.id) return json(400, { error: 'Vous ne pouvez pas modifier votre propre accès' });

      const { error: banError } = await admin.auth.admin.updateUserById(userId, {
        ban_duration: active ? 'none' : BAN_FOREVER,
      });
      if (banError) return json(502, { error: `Mise à jour de la connexion impossible : ${banError.message}` });

      const { error: upError } = await admin.from('profiles').update({ is_active: active }).eq('id', userId);
      if (upError) return json(500, { error: upError.message });
      return json(200, { id: userId, is_active: active });
    }

    case 'resend': {
      const userId = String(body.user_id ?? '');
      if (!UUID_RE.test(userId)) return json(400, { error: 'Identifiant invalide' });
      if (!appUrl) return json(500, { error: 'APP_URL non configurée sur la fonction' });
      const { data: p } = await admin.from('profiles').select('email').eq('id', userId).maybeSingle();
      if (!p) return json(404, { error: 'Utilisateur introuvable' });
      const { error } = await admin.auth.resetPasswordForEmail(p.email, { redirectTo: `${appUrl}/definir-mot-de-passe` });
      if (error) return json(502, { error: error.message });
      return json(200, { sent: true });
    }

    default:
      return json(400, { error: 'Action inconnue' });
  }
});
