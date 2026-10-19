import { Link } from 'react-router-dom';
import { ArrowRight, FolderKanban } from 'lucide-react';
import { Card } from '@/components/ui';
import { useProjects } from './api';
import { ProjectStatusBadge } from './components';
import { needsAction, suggestedAction } from './meta';

/** Encart « Projets à traiter » (accueil, tableau de bord). */
export function ProjectsToHandle({ limit = 6 }: { limit?: number }) {
  const projects = useProjects();
  const list = (projects.data ?? []).filter((p) => needsAction(p))
    .sort((a, b) => Number(b.is_late) - Number(a.is_late) || a.last_activity_at.localeCompare(b.last_activity_at));
  if (projects.isPending || projects.isError || list.length === 0) return null;
  return (
    <Card className="mb-6">
      <div className="flex items-center justify-between border-b border-beige px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><FolderKanban className="h-4 w-4 text-terracotta" /> Projets à traiter <span className="font-normal text-anthracite-500">({list.length})</span></h2>
        <Link to="/projets" className="inline-flex items-center gap-1 text-sm text-terracotta-700 hover:underline">Tous les projets <ArrowRight className="h-3.5 w-3.5" /></Link>
      </div>
      <ul className="divide-y divide-beige">
        {list.slice(0, limit).map((p) => (
          <li key={p.id}>
            <Link to={`/projets/${p.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 hover:bg-creme/70">
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.company_name}</span>
              {p.is_late && <span className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-800">En retard</span>}
              <ProjectStatusBadge status={p.status} />
              <span className="w-full text-xs text-anthracite-500 sm:w-auto sm:max-w-[45%] sm:truncate">{suggestedAction(p)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
