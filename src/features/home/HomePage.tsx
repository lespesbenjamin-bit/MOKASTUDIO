import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '@/features/auth/AuthProvider';
import { navFor } from '@/app/navigation';
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/lib/roles';
import { Badge, Card, PageHeader } from '@/components/ui';

export function HomePage() {
  const { profile, role } = useAuth();
  if (!profile || !role) return null;

  const modules = navFor(role).flatMap((s) => s.items).filter((i) => i.to !== '/');
  const hour = new Date().getHours();
  const greeting = hour < 18 ? 'Bonjour' : 'Bonsoir';

  return (
    <>
      <PageHeader
        title={`${greeting}, ${profile.full_name.split(' ')[0]}`}
        description={new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      />

      <Card className="mb-6 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="terracotta">{ROLE_LABELS[role]}</Badge>
          <span className="text-sm text-anthracite-500">{ROLE_DESCRIPTIONS[role]}</span>
        </div>
      </Card>

      <h2 className="mb-3 text-sm font-medium text-anthracite-500">Vos espaces</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((m) => {
          const Icon = m.icon;
          const body = (
            <Card className={m.comingInStep ? 'p-4 opacity-70' : 'group p-4 transition-shadow hover:shadow-md'}>
              <div className="flex items-start justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-creme">
                  <Icon className="h-4 w-4 text-terracotta" aria-hidden />
                </div>
                {m.comingInStep ? (
                  <Badge tone="muted">Étape {m.comingInStep}</Badge>
                ) : (
                  <ArrowRight className="h-4 w-4 text-anthracite-300 transition-transform group-hover:translate-x-0.5" aria-hidden />
                )}
              </div>
              <p className="mt-3 text-sm font-medium">{m.label}</p>
            </Card>
          );
          return m.comingInStep ? <div key={m.to}>{body}</div> : <Link key={m.to} to={m.to}>{body}</Link>;
        })}
      </div>
    </>
  );
}
