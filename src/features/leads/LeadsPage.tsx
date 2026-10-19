import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { clsx } from 'clsx';
import { Briefcase, Columns3, List, Plus, Search, Upload, X } from 'lucide-react';
import { LEAD_STATUSES, OPEN_STATUSES, SOURCE_LABELS, STATUS_LABELS, contactName, daysFromToday, normalizeSearch } from '@/lib/crm';
import { humanizeError } from '@/lib/supabase';
import { useAuth } from '@/features/auth/AuthProvider';
import { Alert, Button, Card, EmptyState, Input, PageHeader, Segmented, Select, Spinner } from '@/components/ui';
import { useLeads, useStaleDays, useTeam } from './api';
import { KanbanBoard } from './KanbanBoard';
import { LeadsTable } from './LeadsTable';
import { NewLeadModal } from './LeadForm';
import { ImportModal } from '@/features/import/ImportModal';
import type { LeadOverview, LeadSource, LeadStatus } from './types';

type View = 'kanban' | 'table';
type Quick = '' | 'retard' | 'inactifs' | 'a_attribuer';
const VIEW_KEY = 'moka.leads.view';
const CLOSED_VISIBLE_DAYS = 30;

function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'table' ? 'table' : 'kanban';
  } catch {
    return 'kanban';
  }
}

export function LeadsPage() {
  const { role, profile } = useAuth();
  const isAdmin = role === 'admin';
  const leads = useLeads();
  const team = useTeam(isAdmin);
  const staleDays = useStaleDays();
  const [params, setParams] = useSearchParams();
  const [view, setViewState] = useState<View>(readView);
  const [newOpen, setNewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const q = params.get('q') ?? '';
  const owner = params.get('responsable') ?? '';
  const source = (params.get('source') ?? '') as LeadSource | '';
  const status = (params.get('statut') ?? '') as LeadStatus | '';
  const quick = (params.get('filtre') ?? '') as Quick;

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const setView = (v: View) => {
    setViewState(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* stockage indisponible */ }
  };

  const stale = staleDays.data ?? 14;
  const isLate = (l: LeadOverview) => !!l.next_follow_up_at && daysFromToday(l.next_follow_up_at) < 0 && OPEN_STATUSES.includes(l.status);
  const isStale = (l: LeadOverview) => OPEN_STATUSES.includes(l.status) && -daysFromToday(l.last_activity_at) >= stale;

  const filtered = useMemo(() => {
    const needle = normalizeSearch(q);
    return (leads.data ?? []).filter((l) => {
      if (needle) {
        const hay = normalizeSearch(
          [l.company_name, l.city, l.postal_code, l.sector, contactName(l.contact_first_name, l.contact_last_name), l.contact_email, l.contact_phone, l.siren]
            .filter(Boolean).join(' '),
        );
        if (!hay.includes(needle)) return false;
      }
      if (owner === 'moi' && l.owner_id !== profile?.id) return false;
      if (owner === 'aucun' && l.owner_id) return false;
      if (owner && owner !== 'moi' && owner !== 'aucun' && l.owner_id !== owner) return false;
      if (source && l.source !== source) return false;
      if (status && l.status !== status) return false;
      if (quick === 'retard' && !isLate(l)) return false;
      if (quick === 'inactifs' && !isStale(l)) return false;
      if (quick === 'a_attribuer' && l.owner_id) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads.data, q, owner, source, status, quick, profile?.id, stale]);

  // Le Kanban n'affiche que les dossiers clos récemment, pour rester lisible
  const kanbanLeads = useMemo(
    () => filtered.filter((l) => OPEN_STATUSES.includes(l.status) || -daysFromToday(l.status_changed_at) <= CLOSED_VISIBLE_DAYS),
    [filtered],
  );

  const counts = useMemo(() => {
    const all = leads.data ?? [];
    return {
      retard: all.filter(isLate).length,
      inactifs: all.filter(isStale).length,
      a_attribuer: all.filter((l) => !l.owner_id).length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads.data, stale]);

  const hasFilters = Boolean(q || owner || source || status || quick);
  const chips: { key: Quick; label: string; count: number; show: boolean }[] = [
    { key: 'retard', label: 'Relances en retard', count: counts.retard, show: true },
    { key: 'inactifs', label: `Sans activité depuis ${stale} j`, count: counts.inactifs, show: true },
    { key: 'a_attribuer', label: 'À attribuer', count: counts.a_attribuer, show: isAdmin },
  ];

  return (
    <>
      <PageHeader
        title="Prospects"
        description={leads.data ? `${leads.data.filter((l) => OPEN_STATUSES.includes(l.status)).length} prospects en cours` : undefined}
        actions={
          <>
            {isAdmin && (
              <Button variant="secondary" icon={<Upload className="h-4 w-4" />} onClick={() => setImportOpen(true)}>Importer</Button>
            )}
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setNewOpen(true)}>Nouveau prospect</Button>
          </>
        }
      />

      <div className="mb-4 space-y-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-anthracite-300" aria-hidden />
            <Input
              value={q}
              onChange={(e) => setParam('q', e.target.value)}
              placeholder="Entreprise, ville, contact, téléphone…"
              className="pl-9"
              aria-label="Rechercher un prospect"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            {isAdmin && (
              <Select value={owner} onChange={(e) => setParam('responsable', e.target.value)} className="sm:!w-52" aria-label="Responsable">
                <option value="">Toute l’équipe</option>
                <option value="moi">Mes prospects</option>
                <option value="aucun">Non attribués</option>
                {team.data?.filter((m) => m.id !== profile?.id).map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
              </Select>
            )}
            <Select value={source} onChange={(e) => setParam('source', e.target.value)} className="sm:!w-44" aria-label="Source">
              <option value="">Toutes sources</option>
              {Object.entries(SOURCE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
            {view === 'table' && (
              <Select value={status} onChange={(e) => setParam('statut', e.target.value)} className="sm:!w-44" aria-label="Statut">
                <option value="">Tous les statuts</option>
                {LEAD_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </Select>
            )}
          </div>
          <Segmented
            label="Affichage"
            value={view}
            onChange={setView}
            options={[
              { value: 'kanban', label: 'Pipeline', icon: <Columns3 className="h-3.5 w-3.5" /> },
              { value: 'table', label: 'Liste', icon: <List className="h-3.5 w-3.5" /> },
            ]}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {chips.filter((c) => c.show).map((c) => (
            <button
              key={c.key}
              onClick={() => setParam('filtre', quick === c.key ? '' : c.key)}
              className={clsx(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors',
                quick === c.key ? 'border-anthracite bg-anthracite text-white' : 'border-beige-300 bg-white text-anthracite-700 hover:bg-creme',
              )}
            >
              {c.label}
              <span className={clsx('tabular-nums', quick === c.key ? 'text-white/70' : c.count ? 'text-terracotta-700' : 'text-anthracite-300')}>
                {c.count}
              </span>
            </button>
          ))}
          {hasFilters && (
            <button onClick={() => setParams({}, { replace: true })} className="inline-flex items-center gap-1 text-xs text-anthracite-500 hover:text-anthracite">
              <X className="h-3 w-3" /> Effacer les filtres
            </button>
          )}
        </div>
      </div>

      {leads.isPending ? (
        <Spinner />
      ) : leads.isError ? (
        <Alert>{humanizeError(leads.error)}</Alert>
      ) : leads.data.length === 0 ? (
        <Card>
          <EmptyState icon={<Briefcase className="h-8 w-8" />} title="Aucun prospect pour l’instant">
            Créez votre premier prospect{isAdmin ? ' ou importez un fichier Excel' : ''} pour démarrer le pipeline.
          </EmptyState>
        </Card>
      ) : view === 'kanban' ? (
        <>
          {filtered.length === 0 && <p className="mb-3 text-sm text-anthracite-500">Aucun prospect ne correspond aux filtres.</p>}
          <KanbanBoard leads={kanbanLeads} />
          <p className="text-xs text-anthracite-300">
            Glissez une carte pour changer son statut (appui long sur mobile). Les dossiers gagnés ou perdus restent visibles {CLOSED_VISIBLE_DAYS} jours ; la vue Liste les montre tous.
          </p>
        </>
      ) : (
        <Card>
          {filtered.length === 0 ? (
            <EmptyState title="Aucun résultat">Modifiez la recherche ou les filtres.</EmptyState>
          ) : (
            <LeadsTable leads={filtered} />
          )}
        </Card>
      )}

      <NewLeadModal open={newOpen} onClose={() => setNewOpen(false)} />
      {isAdmin && <ImportModal open={importOpen} onClose={() => setImportOpen(false)} />}
    </>
  );
}
