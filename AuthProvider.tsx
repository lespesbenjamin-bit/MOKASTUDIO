import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Profile, UserRole } from '@/types/database';

type AuthState = {
  /** true tant que la session initiale n'est pas connue */
  loading: boolean;
  session: Session | null;
  /** Profil applicatif ; null si absent (compte non provisionné) */
  profile: Profile | null;
  profileError: string | null;
  /** true après clic sur un lien « mot de passe oublié » */
  recovering: boolean;
  role: UserRole | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [recovering, setRecovering] = useState(false);

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null);
      setProfileReady(true);
      return;
    }
    setProfileReady(false);
    // La RLS ne renvoie que la ligne de l'utilisateur (ou toutes pour un admin) :
    // on filtre donc explicitement sur son id.
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    setProfileError(error ? error.message : null);
    setProfile(data ?? null);
    setProfileReady(true);
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setSessionReady(true);
      void loadProfile(data.session?.user.id);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      if (event === 'USER_UPDATED' || event === 'SIGNED_OUT') setRecovering(false);
      setSession(next);
      // Évite d'appeler Supabase de manière synchrone dans le callback
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        setTimeout(() => void loadProfile(next?.user.id), 0);
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const value = useMemo<AuthState>(
    () => ({
      loading: !sessionReady || (Boolean(session) && !profileReady),
      session,
      profile,
      profileError,
      recovering,
      role: profile?.is_active ? profile.role : null,
      refreshProfile: () => loadProfile(session?.user.id),
      signOut: async () => {
        setRecovering(false);
        await supabase.auth.signOut();
      },
    }),
    [sessionReady, profileReady, session, profile, profileError, recovering, loadProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>');
  return ctx;
}
