import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { AlertTriangle, ArrowDown, ArrowUp, Columns3, FolderKanban, List, Paperclip, Search } from 'lucide-react';
import { formatAgo, formatDay, normalizeSearch } from '@/lib/crm';
import { OFFER_LABELS } from '@/lib/sales';
import { humanizeError } from '@/lib/supabase';
import { useAuth } from '@/features/auth/AuthProvider';
import { useTeam } from '@/features/leads/api';
import { Alert, Card, EmptyState, Input, PageHeader, Segmented, Select, Spinner } from '@/components/ui';
import type { ProjectOverview, ProjectStatus } from '@/types/database';
import { useProjects, useSetStatusAny } from './api';
import {
  PROJECT_COLUMNS, PROJECT_STATUS_DOT, PROJECT_STATUS_LABELS, QUESTIONNAIRE_LABELS, daysLeft, isClosed, projectKpis,
  suggestedAction, type ProjectKpis,
} from './meta';
import { DeliverModal } from './components';

type View = 'kanban' | 'table';
type Kpi = keyof ProjectKpis | '';
const VIEW_KEY = 'moka.projects.view';

const KPI_DEFS: { key: keyof ProjectKpis; label: string; test: (p: ProjectOverview) => boolean }[] = [
  { key: 'waiting', label: 'En attente de questionnaire', test: (p) => p.status === 'en_attente_infos' && p.questionnaire_status === 'non_commence' },
  { key: 'partial', label: 'Partiellement remplis', test: (p) => p.status === 'en_attente_infos' && p.questionnaire_status === 'en_cours' },
  { key: 'received', label: 'Questionnaires reçus', test: (p) => p.status === 'questionnaire_recu' || p.status === 'brief_a_valider' },
  { key: 'ready', label: 'Prêts à produire', test: (p) => p.status === 'pret_a_produire' },
  { key: 'building', label: 'Sites en création', test: (p) => p.status === 'en_creation' },
  { key: 'validation', label: 'Sites en validation', test: (p) => p.status === 'en_validation_client' || p.status === 'pret_a_publier' },
  { key: 'delivered', label: 'Sites livrés', test: (p) => p.status === 'livre' },
  { key: 'late', label: 'Projets en retard', test: (p) => p.is_late },
];

function readView(): View {
  try { return localStorage.getItem(VIEW_KEY) === 'table' ? 'table' : 'kanban'; } catch { return 'kanban'; }
}

export function ProjectsPage() {
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const projects = useProjects();
  const team = useTeam(isAdmin);
  const [params, setParams] = useSearchParams();
  const [view, setViewState] = useState<View>(readView);
  const q = params.get('q') ?? '';
  const owner = params.get('responsable') ?? '';
  const offer = params.get('offre') ?? '';
  const kpi = (params.get('indicateur') ?? '') as Kpi;
  const showCancelled = params.get('annules') === '1';

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };
  const setView = (v: View) => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* ignore */ } };

  const all = useMemo(() => projects.data ?? [], [projects.data]);
  const kpis = projectKpis(all);
  const filtered = useMemo(() => {
    const nq = normalizeSearch(q);
    const def = KPI_DEFS.find((d) => d.key === kpi);
    return all.filter((p) =>
      (showCancelled || p.status !== 'annule')
      && (!nq || normalizeSearch(`${p.company_name} ${p.title} ${p.city ?? ''} ${p.contract_reference ?? ''}`).includes(nq))
      && (!owner || p.owner_id === owner || p.assignee_id === owner)
      && (!offer || p.offer_code === offer)
      && (!def || def.test(p)));
  }, [all, q, owner, offer, kpi, showCancelled]);

  if (projects.isLoading) return <Spinner />;
  if (projects.error) return <Alert>{humanizeError(projects.error)}</Alert>;

  return (
    <>
      <PageHeader
        title="Projets clients"
        description="De la signature à la mise en ligne : questionnaire, brief, production et livraison (délai annoncé : 7 à 10 jours après réception des éléments et validation du périmètre)."
      />

      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {KPI_DEFS.map((d) => (
          <button key={d.key} type="button" onClick={() => setParam('indicateur', kpi === d.key ? '' : d.key)} aria-pressed={kpi === d.key}
            className={clsx('rounded-xl border p-3 text-left transition-colors',
              kpi === d.key ? 'border-terracotta bg-terracotta-50' : 'border-beige-300/80 bg-white hover:border-anthracite-300',
              d.key === 'late' && kpis.late > 0 && kpi !== d.key && 'border-red-200 bg-red-50/60')}>
            <p className={clsx('font-display text-2xl font-semibold tabular-nums', d.key === 'late' && kpis.late > 0 ? 'text-red-700' : 'text-anthracite')}>{kpis[d.key]}</p>
            <p className="mt-0.5 text-xs leading-snug text-anthracite-500">{d.label}</p>
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented<View> label="Affichage" value={view} onChange={setView}
          options={[{ value: 'kanban', label: 'Kanban', icon: <Columns3 className="h-4 w-4" /> }, { value: 'table', label: 'Tableau', icon: <List className="h-4 w-4" /> }]} />
        <div className="relative w-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-anthracite-300" aria-hidden />
          <Input value={q} onChange={(e) => setParam('q', e.target.value)} placeholder="Client, référence…" className="h-9 pl-9" aria-label="Rechercher un projet" />
        </div>
        {isAdmin && (
          <div className="w-52">
            <Select value={owner} onChange={(e) => setParam('responsable', e.target.value)} className="h-9" aria-label="Responsable">
              <option value="">Tous les responsables</option>
              {(team.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </Select>
          </div>
        )}
        <div className="w-44">
          <Select value={offer} onChange={(e) => setParam('offre', e.target.value)} className="h-9" aria-label="Offre">
            <option value="">Toutes les offres</option>
            <option value="abonnement">{OFFER_LABELS.abonnement}</option>
            <option value="vente_directe">{OFFER_LABELS.vente_directe}</option>
          </Select>
        </div>
        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-beige-300 bg-white px-3 text-sm text-anthracite-700">
          <input type="checkbox" className="accent-terracotta" checked={showCancelled} onChange={(e) => setParam('annules', e.target.checked ? '1' : '')} />
          Annulés
        </label>
      </div>

      {all.length === 0 ? (
        <Card className="p-2">
          <EmptyState icon={<FolderKanban className="h-6 w-6" />} title="Aucun projet pour l’instant">
            Créez un projet depuis la fiche d’un client (<Link to="/clients" className="text-terracotta-700 underline">Clients & contrats</Link>) avec le bouton « Créer une fiche projet ».
          </EmptyState>
        </Card>
      ) : view === 'kanban' ? (
        <ProjectKanban projects={filtered.filter((p) => p.status !== 'annule')} canDrag={isAdmin} />
      ) : (
        <ProjectsTable projects={filtered} />
      )}
    </>
  );
}

// --- Carte projet ------------------------------------------------------------------
export function DueBadge({ p }: { p: ProjectOverview }) {
  if (isClosed(p)) return null;
  const left = daysLeft(p);
  if (left === null) return null;
  if (p.is_late) return <span className="inline-flex items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-800"><AlertTriangle className="h-3 w-3" /> Retard {-left} j</span>;
  return <span className={clsx('rounded px-1.5 py-0.5 text-[11px]', left <= 2 ? 'bg-amber-50 text-amber-800' : 'bg-beige/70 text-anthracite-700')}>{left === 0 ? 'Livraison aujourd’hui' : `J-${left}`}</span>;
}

function CompletionBar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-beige"><div className="h-full rounded-full bg-terracotta" style={{ width: `${pct}%` }} /></div>
      <span className="text-[11px] tabular-nums text-anthracite-500">{pct} %</span>
    </div>
  );
}

function CardBody({ p }: { p: ProjectOverview }) {
  return (
    <>
      <p className="truncate text-sm font-medium text-anthracite">{p.company_name}</p>
      <p className="truncate text-xs text-anthracite-500">{p.offer_code ? OFFER_LABELS[p.offer_code] : '—'}{p.city ? ` · ${p.city}` : ''}</p>
      {p.status === 'en_attente_infos' && (
        <div className="mt-2"><CompletionBar pct={p.completion_pct ?? 0} /></div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <DueBadge p={p} />
        {p.files_count > 0 && <span className="inline-flex items-center gap-0.5 text-[11px] text-anthracite-500"><Paperclip className="h-3 w-3" />{p.files_count}</span>}
        <span className="ml-auto truncate text-[11px] text-anthracite-500">{p.owner_name ?? ''}</span>
      </div>
    </>
  );
}

function DraggableCard({ p, canDrag }: { p: ProjectOverview; canDrag: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: p.id, data: { p }, disabled: !canDrag });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={clsx('touch-manipulation rounded-lg', isDragging && 'opacity-30')}>
      <Link to={`/projets/${p.id}`} draggable={false}
        className={clsx('block rounded-lg border bg-white p-3 shadow-card transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta/40',
          p.is_late ? 'border-red-200' : 'border-beige-300/80')}>
        <CardBody p={p} />
      </Link>
    </div>
  );
}

function Column({ status, items, canDrag }: { status: ProjectStatus; items: ProjectOverview[]; canDrag: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: status, disabled: !canDrag });
  return (
    <section ref={setNodeRef} aria-label={PROJECT_STATUS_LABELS[status]}
      className={clsx('flex w-[78vw] max-w-[260px] shrink-0 snap-start flex-col rounded-xl border transition-colors sm:w-60',
        isOver ? 'border-terracotta/50 bg-terracotta-50/60' : 'border-transparent bg-beige/40')}>
      <header className="flex items-center gap-2 px-3 pb-2 pt-3">
        <span className={clsx('h-2 w-2 rounded-full', PROJECT_STATUS_DOT[status])} aria-hidden />
        <h2 className="flex-1 truncate text-xs font-semibold uppercase tracking-wide text-anthracite-700">{PROJECT_STATUS_LABELS[status]}</h2>
        <span className="rounded-md bg-white/80 px-1.5 text-xs tabular-nums text-anthracite-500">{items.length}</span>
      </header>
      <div className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-3">
        {items.map((p) => <DraggableCard key={p.id} p={p} canDrag={canDrag} />)}
        {items.length === 0 && <p className="rounded-lg border border-dashed border-beige-300 px-3 py-4 text-center text-xs text-anthracite-300">{canDrag ? 'Déposer ici' : 'Aucun projet'}</p>}
      </div>
    </section>
  );
}

function ProjectKanban({ projects, canDrag }: { projects: ProjectOverview[]; canDrag: boolean }) {
  const [active, setActive] = useState<ProjectOverview | null>(null);
  const [deliver, setDeliver] = useState<ProjectOverview | null>(null);
  const setStatus = useSetStatusAny();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const byStatus = useMemo(() => {
    const m = Object.fromEntries(PROJECT_COLUMNS.map((s) => [s, [] as ProjectOverview[]])) as Record<ProjectStatus, ProjectOverview[]>;
    for (const p of projects) m[p.status]?.push(p);
    return m;
  }, [projects]);

  const onDragStart = (e: DragStartEvent) => setActive((e.active.data.current as { p: ProjectOverview }).p);
  const onDragEnd = (e: DragEndEvent) => {
    setActive(null);
    const p = (e.active.data.current as { p: ProjectOverview } | undefined)?.p;
    const to = e.over?.id as ProjectStatus | undefined;
    if (!p || !to || to === p.status) return;
    if (to === 'livre') { setDeliver(p); return; }
    setStatus.mutate({ id: p.id, status: to });
  };

  return (
    <>
      {setStatus.isError && <div className="mb-3"><Alert>{humanizeError(setStatus.error)}</Alert></div>}
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
        <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10" style={{ minHeight: '55vh' }}>
          {PROJECT_COLUMNS.map((s) => <Column key={s} status={s} items={byStatus[s]} canDrag={canDrag} />)}
        </div>
        <DragOverlay dropAnimation={null}>
          {active && <div className="w-56 rotate-1 rounded-lg border border-terracotta/40 bg-white p-3 shadow-xl"><CardBody p={active} /></div>}
        </DragOverlay>
      </DndContext>
      {deliver && <DeliverModal project={deliver} onClose={() => setDeliver(null)} />}
    </>
  );
}

// --- Tableau -----------------------------------------------------------------------
type SortKey = 'company_name' | 'offer_code' | 'owner_name' | 'status' | 'completion_pct' | 'created_at' | 'target_date' | 'last_activity_at';
const rank = Object.fromEntries([...PROJECT_COLUMNS, 'annule'].map((s, i) => [s, i])) as Record<string, number>;

function ProjectsTable({ projects }: { projects: ProjectOverview[] }) {
  const navigate = useNavigate();
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'target_date', dir: 1 });
  const rows = useMemo(() => [...projects].sort((a, b) => {
    const va = sort.key === 'status' ? rank[a.status] : a[sort.key];
    const vb = sort.key === 'status' ? rank[b.status] : b[sort.key];
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'fr', { sensitivity: 'base' });
    return c * sort.dir;
  }), [projects, sort]);

  const th = (key: SortKey, label: string) => (
    <th scope="col" className="px-3 py-2 text-left font-medium">
      <button onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))} className="inline-flex items-center gap-1 hover:text-anthracite"
        aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
        {label}{sort.key === key && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </th>
  );

  if (!rows.length) return <Card className="p-6 text-center text-sm text-anthracite-500">Aucun projet ne correspond aux filtres.</Card>;
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[960px] text-sm">
        <thead className="border-b border-beige text-xs text-anthracite-500">
          <tr>
            {th('company_name', 'Client')}{th('offer_code', 'Offre')}{th('owner_name', 'Responsable')}{th('status', 'Statut')}
            {th('completion_pct', 'Questionnaire')}{th('created_at', 'Création')}{th('target_date', 'Date cible')}{th('last_activity_at', 'Dernière activité')}
            <th scope="col" className="px-3 py-2 text-left font-medium">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-beige">
          {rows.map((p) => (
            <tr key={p.id} onClick={() => navigate(`/projets/${p.id}`)} className="cursor-pointer hover:bg-creme/70">
              <td className="px-3 py-2.5">
                <Link to={`/projets/${p.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-anthracite hover:underline">{p.company_name}</Link>
                <p className="text-xs text-anthracite-500">{p.contract_reference ?? '—'}</p>
              </td>
              <td className="px-3 py-2.5 text-anthracite-700">{p.offer_code ? OFFER_LABELS[p.offer_code] : '—'}</td>
              <td className="px-3 py-2.5 text-anthracite-700">
                {p.owner_name ?? '—'}
                {p.assignee_name && <p className="text-xs text-anthracite-500">Prod. : {p.assignee_name}</p>}
              </td>
              <td className="px-3 py-2.5">
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-anthracite-700">
                  <span className={clsx('h-2 w-2 rounded-full', PROJECT_STATUS_DOT[p.status])} />{PROJECT_STATUS_LABELS[p.status]}
                </span>
              </td>
              <td className="px-3 py-2.5">
                <span className="text-xs text-anthracite-500">{p.questionnaire_status ? QUESTIONNAIRE_LABELS[p.questionnaire_status] : '—'}</span>
                <div className="w-28"><CompletionBar pct={p.completion_pct ?? 0} /></div>
              </td>
              <td className="px-3 py-2.5 whitespace-nowrap text-anthracite-700">{formatDay(p.created_at)}</td>
              <td className="px-3 py-2.5 whitespace-nowrap">
                <span className="text-anthracite-700">{p.target_date ? formatDay(p.target_date) : '—'}</span>
                <div><DueBadge p={p} /></div>
              </td>
              <td className="px-3 py-2.5 whitespace-nowrap text-anthracite-500">{formatAgo(p.last_activity_at)}</td>
              <td className="max-w-[220px] px-3 py-2.5 text-xs text-anthracite-700">{suggestedAction(p) ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
