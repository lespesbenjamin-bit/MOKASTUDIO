import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { isSupabaseConfigured } from '@/lib/supabase';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { LoginPage } from '@/features/auth/LoginPage';
import { SetPasswordPage } from '@/features/auth/SetPasswordPage';
import { HomePage } from '@/features/home/HomePage';
import { ProfilePage } from '@/features/account/ProfilePage';
import { UsersPage } from '@/features/settings/UsersPage';
import { LeadsPage } from '@/features/leads/LeadsPage';
import { LeadDetailPage } from '@/features/leads/LeadDetailPage';
import { TasksPage } from '@/features/tasks/TasksPage';
import { ReferralsPage } from '@/features/referrer/ReferralsPage';
import { CustomersPage } from '@/features/sales/CustomersPage';
import { ContractPage } from '@/features/sales/ContractPage';
import { PaymentsPage } from '@/features/sales/PaymentsPage';
import { CommissionsPage } from '@/features/sales/CommissionsPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { Alert } from '@/components/ui';
import { AppLayout } from './app/AppLayout';
import { RequireAuth, RequireRole } from './app/guards';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
});

function MissingConfig() {
  return (
    <AuthLayout title="Configuration requise" subtitle="L'application n'est pas encore reliée à Supabase.">
      <Alert tone="info">
        Renseignez <code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_ANON_KEY</code> dans <code>.env.local</code> (en local)
        ou dans les variables d'environnement Vercel, puis relancez.
      </Alert>
    </AuthLayout>
  );
}

export function App() {
  if (!isSupabaseConfigured) return <MissingConfig />;

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/connexion" element={<LoginPage />} />
            <Route path="/definir-mot-de-passe" element={<SetPasswordPage />} />
            <Route element={<RequireAuth />}>
              <Route element={<AppLayout />}>
                <Route index element={<HomePage />} />
                <Route path="mon-profil" element={<ProfilePage />} />
                <Route
                  path="parametres/utilisateurs"
                  element={<RequireRole roles={['admin']}><UsersPage /></RequireRole>}
                />
                <Route path="prospects" element={<RequireRole roles={['admin', 'commercial']}><LeadsPage /></RequireRole>} />
                <Route path="prospects/:id" element={<RequireRole roles={['admin', 'commercial']}><LeadDetailPage /></RequireRole>} />
                <Route path="relances" element={<RequireRole roles={['admin', 'commercial']}><TasksPage /></RequireRole>} />
                <Route path="apports" element={<RequireRole roles={['apporteur']}><ReferralsPage /></RequireRole>} />
                <Route path="clients" element={<RequireRole roles={['admin', 'commercial']}><CustomersPage /></RequireRole>} />
                <Route path="clients/:id" element={<RequireRole roles={['admin', 'commercial']}><ContractPage /></RequireRole>} />
                <Route path="paiements" element={<RequireRole roles={['admin']}><PaymentsPage /></RequireRole>} />
                <Route path="commissions" element={<CommissionsPage />} />
                <Route path="parametres" element={<RequireRole roles={['admin']}><SettingsPage /></RequireRole>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
