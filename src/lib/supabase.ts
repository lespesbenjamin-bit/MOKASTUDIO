import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { DEMO_WRITE_MESSAGE, currentDemoRole, demoFetch, demoSession } from '@/demo/server';

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

// --- Mode démonstration --------------------------------------------------------
// Activé en ouvrant /demo ; reste actif dans l'onglet jusqu'à « Quitter la démo ».
// Le client ne parle alors qu'au faux serveur en mémoire (src/demo) : aucune
// requête vers Supabase, aucune donnée réelle affichée ou modifiée.
const DEMO_FLAG = 'moka-demo';
export const isDemo: boolean = (() => {
  if (typeof window === 'undefined') return false;
  try {
    if (window.location.pathname === '/demo') sessionStorage.setItem(DEMO_FLAG, '1');
    return sessionStorage.getItem(DEMO_FLAG) === '1';
  } catch {
    return false;
  }
})();

export function exitDemo() {
  try { sessionStorage.removeItem(DEMO_FLAG); } catch { /* ignore */ }
  window.location.href = '/connexion';
}

function demoStorage() {
  const key = 'sb-demo-auth-token';
  const mem = new Map<string, string>([[key, JSON.stringify(demoSession(currentDemoRole()))]]);
  return {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
}

// Seule la clé ANON (publique) est utilisée côté navigateur.
export const supabase = isDemo
  ? createClient<Database>('https://demo.invalid', 'demo', {
      auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, storage: demoStorage(), storageKey: 'sb-demo-auth-token' },
      global: { fetch: demoFetch },
    })
  : createClient<Database>(
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
    [/Mode démonstration/i, DEMO_WRITE_MESSAGE],
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
    [/client_projects_contract_uidx/i, 'Un projet existe déjà pour ce contrat.'],
    [/violates check constraint/i, 'Certaines valeurs ne sont pas valides.'],
  ];
  for (const [re, msg] of map) if (re.test(raw)) return msg;
  return raw || 'Une erreur inattendue est survenue.';
}

/** Appelle l'Edge Function d'administration des comptes. */
export async function callAdminUsers<T = unknown>(body: Record<string, unknown>): Promise<T> {
  return callFunction<T>('admin-users', body);
}

/** Appelle une Edge Function et remonte son message d'erreur métier. */
export async function callFunction<T = unknown>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) {
    // Le message métier est dans le corps de la réponse d'erreur
    const ctx = (error as { context?: Response }).context;
    let message: string | undefined;
    if (ctx && typeof ctx.json === 'function') {
      try { message = ((await ctx.json()) as { error?: string; message?: string })?.error; } catch { /* corps non JSON */ }
    }
    if (message) throw new Error(humanizeError(message));
    throw new Error(humanizeError(error));
  }
  return data as T;
}
