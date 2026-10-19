import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import { useAuth } from '@/features/auth/AuthProvider';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { Alert, Button, FullPageSpinner } from '@/components/ui';
import type { UserRole } from '@/types/database';

/** Exige une session ET un profil actif. */
export function RequireAuth() {
  const { loading, session, profile, profileError, recovering, signOut, refreshProfile } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageSpinner />;
  if (!session) return <Navigate to="/connexion" replace state={{ from: location.pathname }} />;
  if (recovering) return <Navigate to="/definir-mot-de-passe" replace />;

  if (profileError) {
    return (
      <AuthLayout title="Erreur de chargement" subtitle="Impossible de récupérer votre profil.">
        <div className="space-y-4">
          <Alert>{profileError}</Alert>
          <Button onClick={() => void refreshProfile()} className="w-full">Réessayer</Button>
        </div>
      </AuthLayout>
    );
  }

  if (!profile || !profile.is_active) {
    return (
      <AuthLayout
        title={profile ? 'Compte désactivé' : 'Compte en attente'}
        subtitle={
          profile
            ? 'Votre accès a été suspendu. Contactez l\'administrateur de Moka Studio.'
            : 'Votre compte n\'a pas encore été activé par un administrateur.'
        }
      >
        <Button variant="secondary" className="w-full" onClick={() => void signOut()}>Se déconnecter</Button>
      </AuthLayout>
    );
  }

  return <Outlet />;
}

/** Restreint une section à certains rôles (la RLS reste la vraie barrière). */
export function RequireRole({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const { role } = useAuth();
  if (!role || !roles.includes(role)) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <ShieldOff className="mx-auto h-8 w-8 text-anthracite-300" aria-hidden />
        <h1 className="mt-4 font-display text-xl font-semibold">Accès réservé</h1>
        <p className="mt-1 text-sm text-anthracite-500">Cette section n'est pas disponible pour votre profil.</p>
      </div>
    );
  }
  return <>{children}</>;
}
