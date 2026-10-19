import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/**
 * Garde uniquement « https://xxxx.supabase.co » : tolère un espace, un « / »
 * final ou un chemin collé par erreur (ex. « …/rest/v1/ » copié depuis Data API).
 */
export function normalizeSupabaseUrl(raw: string | undefined): string | undefined {
  const v = raw?.trim().replace(/^["']|["']$/g, '');
  if (!v) return undefined;
  try {
    return new URL(v).origin;
  } catch {
    return undefined;
  }
}

const url = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL as string | undefined);
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim().replace(/^["']|["']$/g, '');

/** false si les variables d'environnement ne sont pas renseignées. */
export const isSupabaseConfigured = Boolean(url && anonKey && /^https:\/\//.test(url));

// Seule la clé ANON (publique) est utilisée côté navigateur.
export const supabase = createClient<Database>(
  url ?? 'https://not-configured.invalid',
  anonKey ?? 'not-configured',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
);

/** Traduit les erreurs techniques en messages lisibles. */
export function humanizeError(error: unknown): string {
  const raw =
    error instanceof Error ? error.message
    : typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message)
    : String(error);

  const map: [RegExp, string][] = [
    [/Invalid login credentials/i, 'Email ou mot de passe incorrect.'],
    [/Email not confirmed/i, 'Adresse email non confirmée. Utilisez le lien reçu par email.'],
    [/User is banned/i, 'Ce compte est désactivé. Contactez l\'administrateur.'],
    [/Password should be at least/i, 'Le mot de passe est trop court.'],
    [/same.*password|different from the old/i, 'Le nouveau mot de passe doit être différent de l\'ancien.'],
    [/rate limit|too many/i, 'Trop de tentatives. Patientez quelques minutes.'],
    [/Failed to fetch|NetworkError|Load failed/i, 'Connexion au serveur impossible. Vérifiez votre réseau.'],
    [/Modification non autorisée|row-level security|permission denied/i, 'Vous n\'avez pas les droits pour cette action.'],
    [/JWT expired|Auth session missing/i, 'Votre session a expiré. Reconnectez-vous.'],
    [/companies_siren_uidx/i, 'Une entreprise avec ce SIREN existe déjà.'],
    [/leads_one_open_per_company/i, 'Cette entreprise a déjà un prospect en cours.'],
    [/payments_one_per_period/i, 'Une mensualité existe déjà pour ce mois.'],
    [/violates check constraint/i, 'Certaines valeurs ne sont pas valides.'],
  ];
  for (const [re, msg] of map) if (re.test(raw)) return msg;
  return raw || 'Une erreur inattendue est survenue.';
}

/** Appelle l'Edge Function d'administration des comptes. */
export async function callAdminUsers<T = unknown>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('admin-users', { body });
  if (error) {
    // Le message métier est dans le corps de la réponse d'erreur
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const payload = (await ctx.json()) as { error?: string };
        if (payload?.error) throw new Error(payload.error);
      } catch (e) {
        if (e instanceof Error && e.message) throw e;
      }
    }
    throw new Error(humanizeError(error));
  }
  return data as T;
}
