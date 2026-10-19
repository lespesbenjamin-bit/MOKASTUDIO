import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import {
  CheckCircle2, Copy, Download, FileText, Image as ImageIcon, MessageSquare, Plus, Sparkles, Trash2, User, Wand2,
} from 'lucide-react';
import { formatDateTime, formatDay } from '@/lib/crm';
import { humanizeError, supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/AuthProvider';
import { useTeam } from '@/features/leads/api';
import { useAppSettings, useOffers } from '@/features/sales/api';
import { Alert, Badge, Button, Card, EmptyState, Input, Modal, Select, Spinner, Textarea } from '@/components/ui';
import type { PortalFile, ProjectEventRow, ProjectOverview, ProjectTaskRow } from '@/types/database';
import {
  deleteProjectFile, projectKeys, signedUrls, toPortalFile, uploadProjectFile, useAddComment, useProjectBriefs, useProjectEvents,
  useProjectFiles, useProjectTasks, useQuestionnaire, useSaveBrief, useTaskMutations, useValidateBrief,
} from './api';
import { briefFileName, generateBrief } from './brief';
import { EVENT_LABELS, PROJECT_STATUS_LABELS, QUESTIONNAIRE_LABELS, isClosed } from './meta';
import { PrivacyNote, PrivacyText } from './PortalPage';
import { FilesPanel, Questionnaire, type QuestionnaireBackend } from './Questionnaire';
import { FILE_CATEGORIES, missingInfo, type Answers } from './questions';

function unwrap<R extends { data: unknown; error: unknown }>(res: R): Extract<R, { error: null }>['data'] {
  if (res.error) throw res.error;
  return res.data as Extract<R, { error: null }>['data'];
}

async function fetchFiles(projectId: string): Promise<PortalFile[]> {
  const rows = unwrap(await supabase.from('project_files').select('*').eq('project_id', projectId).eq('status', 'valide').order('created_at')) ?? [];
  return rows.map(toPortalFile);
}

function useTeamNames() {
  const team = useTeam(true);
  return useMemo(() => new Map((team.data ?? []).map((t) => [t.id, t.full_name])), [team.data]);
}

// --- Questionnaire -----------------------------------------------------------------
export function QuestionnaireTab({ p }: { p: ProjectOverview }) {
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const q = useQuestionnaire(p.id);
  const files = useProjectFiles(p.id);
  const offers = useOffers();
  const qc = useQueryClient();
  const [privacyOpen, setPrivacyOpen] = useState(false);

  const refresh = () => {
    for (const k of [projectKeys.questionnaire(p.id), projectKeys.files(p.id), projectKeys.one(p.id), projectKeys.events(p.id), projectKeys.list]) {
      void qc.invalidateQueries({ queryKey: k });
    }
  };

  const backend: QuestionnaireBackend = useMemo(() => ({
    save: async (patch, step, pct) => {
      const r = unwrap(await supabase.rpc('project_save_answers', { p_project_id: p.id, p_patch: patch as never, p_step: step, p_completion: pct }));
      void qc.invalidateQueries({ queryKey: projectKeys.one(p.id) });
      return r;
    },
    submit: async () => unwrap(await supabase.rpc('project_submit_questionnaire', { p_project_id: p.id, p_consent: true })),
    upload: (category, file) => uploadProjectFile({ projectId: p.id }, category, file),
    remove: (fileId) => deleteProjectFile({ projectId: p.id }, fileId),
    refreshFiles: async () => { const f = await fetchFiles(p.id); refresh(); return f; },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [p.id]);

  if (q.isPending || files.isPending) return <Spinner />;
  if (q.isError) return <Alert>{humanizeError(q.error)}</Alert>;
  if (!q.data) return <Alert>Questionnaire introuvable.</Alert>;

  const received = q.data.status === 'recu';
  const readOnly = isClosed(p) || (received && !isAdmin);
  const planning = offers.data?.find((o) => o.code === 'option_planning')?.monthly_price_cents ?? null;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <Badge tone={received ? 'success' : q.data.status === 'en_cours' ? 'warning' : 'muted'}>{QUESTIONNAIRE_LABELS[q.data.status]}</Badge>
        {received && q.data.submitted_at && (
          <span className="text-anthracite-500">
            Transmis le {formatDateTime(q.data.submitted_at)} {q.data.submitted_via === 'client' ? 'par le client' : 'par l’équipe'}
          </span>
        )}
        {readOnly && !isClosed(p) && <span className="text-anthracite-500">· Seul un administrateur peut corriger les réponses transmises.</span>}
        {received && isAdmin && !isClosed(p) && <span className="text-anthracite-500">· Vos corrections sont tracées dans l’historique.</span>}
      </div>
      {!received && (
        <p className="mb-4 rounded-lg bg-creme px-4 py-3 text-sm text-anthracite-700">
          Mode rendez-vous : remplissez le questionnaire avec le client. Les réponses sont enregistrées automatiquement et
          le client retrouvera les mêmes informations s’il ouvre son lien.
        </p>
      )}
      <Questionnaire
        key={`${p.id}-${q.data.status}`}
        initialAnswers={q.data.answers as Answers}
        initialStep={0}
        files={(files.data ?? []).map(toPortalFile)}
        mode="equipe"
        backend={backend}
        planningMonthlyCents={planning}
        privacy={<PrivacyNote url={null} onOpen={() => setPrivacyOpen(true)} />}
        readOnly={readOnly}
        submittedAt={q.data.submitted_at}
        canRemove={(f) => isAdmin || f.via === 'equipe'}
        onSubmitted={refresh}
      />
      <Modal open={privacyOpen} onClose={() => setPrivacyOpen(false)} title="Données personnelles du client" size="lg">
        <PrivacyText contact={null} />
      </Modal>
    </div>
  );
}

// --- Documents ---------------------------------------------------------------------
const fmtSize = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} Ko` : `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`);

export function DocumentsTab({ p }: { p: ProjectOverview }) {
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const files = useProjectFiles(p.id);
  const qc = useQueryClient();
  const paths = (files.data ?? []).map((f) => f.storage_path);
  const urls = useQuery({
    queryKey: ['project-file-urls', p.id, paths.join('|')],
    enabled: paths.length > 0,
    staleTime: 8 * 60_000,
    queryFn: () => signedUrls(paths),
  });
  const [dlError, setDlError] = useState<string | null>(null);

  const download = async (path: string) => {
    setDlError(null);
    try {
      const u = (await signedUrls([path], true))[path];
      if (u) window.open(u, '_blank', 'noopener');
    } catch (e) { setDlError(humanizeError(e)); }
  };

  const backend = {
    upload: (category: string, file: File) => uploadProjectFile({ projectId: p.id }, category, file),
    remove: (id: string) => deleteProjectFile({ projectId: p.id }, id),
  };
  const refresh = async () => {
    void qc.invalidateQueries({ queryKey: projectKeys.files(p.id) });
    void qc.invalidateQueries({ queryKey: projectKeys.one(p.id) });
    void qc.invalidateQueries({ queryKey: projectKeys.events(p.id) });
  };

  if (files.isPending) return <Spinner />;
  if (files.isError) return <Alert>{humanizeError(files.error)}</Alert>;
  const list = files.data ?? [];

  return (
    <div className="space-y-4">
      {dlError && <Alert>{dlError}</Alert>}
      {urls.isError && <Alert>Aperçus indisponibles : {humanizeError(urls.error)}</Alert>}
      {list.length === 0 ? (
        <Card><EmptyState icon={<ImageIcon className="h-6 w-6" />} title="Aucun document reçu">Le client peut en envoyer depuis son questionnaire, ou vous pouvez en ajouter ci-dessous.</EmptyState></Card>
      ) : (
        FILE_CATEGORIES.filter((c) => list.some((f) => f.category === c.value)).map((c) => (
          <Card key={c.value} className="p-4">
            <h2 className="mb-3 text-sm font-semibold">{c.label} <span className="font-normal text-anthracite-500">({list.filter((f) => f.category === c.value).length})</span></h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {list.filter((f) => f.category === c.value).map((f) => {
                const u = urls.data?.[f.storage_path];
                const isImg = f.mime_type.startsWith('image/');
                return (
                  <li key={f.id} className="overflow-hidden rounded-lg border border-beige-300 bg-white">
                    <a href={u ?? '#'} target="_blank" rel="noopener noreferrer" className="block aspect-[4/3] bg-creme"
                      onClick={(e) => { if (!u) e.preventDefault(); }}>
                      {isImg && u ? <img src={u} alt={f.original_name} loading="lazy" className="h-full w-full object-cover" />
                        : <span className="flex h-full items-center justify-center text-anthracite-300">{isImg ? <ImageIcon className="h-8 w-8" /> : <FileText className="h-8 w-8" />}</span>}
                    </a>
                    <div className="flex items-center gap-1 px-2 py-1.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium" title={f.original_name}>{f.original_name}</p>
                        <p className="text-[11px] text-anthracite-500">{fmtSize(f.size_bytes)} · {f.uploaded_via === 'client' ? 'client' : 'équipe'}</p>
                      </div>
                      <button type="button" onClick={() => void download(f.storage_path)} className="rounded p-1 text-anthracite-500 hover:bg-creme hover:text-anthracite" aria-label={`Télécharger ${f.original_name}`}>
                        <Download className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))
      )}
      {!isClosed(p) && (
        <Card className="px-4 pb-4 sm:px-6">
          <FilesPanel
            title="Ajouter ou retirer des documents"
            files={list.map(toPortalFile)} backend={backend} onChange={refresh}
            canRemove={(f) => isAdmin || f.via === 'equipe'}
          />
        </Card>
      )}
      <p className="text-xs text-anthracite-500">Documents stockés dans un espace privé ; les aperçus et téléchargements utilisent des liens temporaires (10 minutes).</p>
    </div>
  );
}

// --- Production ----------------------------------------------------------------------
const TASK_STATUS: Record<ProjectTaskRow['status'], string> = { a_faire: 'À faire', en_cours: 'En cours', fait: 'Fait' };

export function ProductionTab({ p }: { p: ProjectOverview }) {
  const { role } = useAuth();
  const isAdmin = role === 'admin' && !isClosed(p);
  const tasks = useProjectTasks(p.id);
  const team = useTeam(true);
  const names = useTeamNames();
  const m = useTaskMutations(p.id);
  const [title, setTitle] = useState('');

  if (tasks.isPending) return <Spinner />;
  if (tasks.isError) return <Alert>{humanizeError(tasks.error)}</Alert>;
  const list = tasks.data ?? [];
  const done = list.filter((t) => t.status === 'fait').length;
  const error = m.add.error ?? m.update.error ?? m.remove.error;

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 border-b border-beige px-4 py-3">
        <h2 className="text-sm font-semibold">Tâches de production</h2>
        <span className="text-xs text-anthracite-500">{done} / {list.length} terminées</span>
        <div className="h-1.5 w-32 overflow-hidden rounded-full bg-beige"><div className="h-full bg-terracotta" style={{ width: `${list.length ? (done / list.length) * 100 : 0}%` }} /></div>
        {!isAdmin && <span className="ml-auto text-xs text-anthracite-500">Gérées par l’administrateur</span>}
      </div>
      {error && <div className="p-3"><Alert>{humanizeError(error)}</Alert></div>}
      <ul className="divide-y divide-beige">
        {list.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
            <input type="checkbox" className="h-4 w-4 accent-terracotta" checked={t.status === 'fait'} disabled={!isAdmin}
              aria-label={`Marquer « ${t.title} » comme ${t.status === 'fait' ? 'à faire' : 'fait'}`}
              onChange={(e) => m.update.mutate({ id: t.id, status: e.target.checked ? 'fait' : 'a_faire' })} />
            <span className={clsx('min-w-0 flex-1 text-sm', t.status === 'fait' && 'text-anthracite-500 line-through')}>{t.title}</span>
            {isAdmin ? (
              <>
                <div className="w-28">
                  <Select className="h-8 text-xs" value={t.status} aria-label="Statut"
                    onChange={(e) => m.update.mutate({ id: t.id, status: e.target.value as ProjectTaskRow['status'] })}>
                    {Object.entries(TASK_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </Select>
                </div>
                <div className="w-36">
                  <Select className="h-8 text-xs" value={t.assignee_id ?? ''} aria-label="Responsable"
                    onChange={(e) => m.update.mutate({ id: t.id, assignee_id: e.target.value || null })}>
                    <option value="">Non attribuée</option>
                    {(team.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                  </Select>
                </div>
                <div className="w-36">
                  <Input type="date" className="h-8 text-xs" value={t.due_on ?? ''} aria-label="Échéance"
                    onChange={(e) => m.update.mutate({ id: t.id, due_on: e.target.value || null })} />
                </div>
                <button type="button" onClick={() => m.remove.mutate(t.id)} className="rounded p-1 text-anthracite-300 hover:text-red-700" aria-label={`Supprimer ${t.title}`}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            ) : (
              <span className="text-xs text-anthracite-500">
                {TASK_STATUS[t.status]}{t.assignee_id ? ` · ${names.get(t.assignee_id) ?? ''}` : ''}{t.due_on ? ` · ${formatDay(t.due_on)}` : ''}
              </span>
            )}
          </li>
        ))}
        {list.length === 0 && <li className="px-4 py-6 text-center text-sm text-anthracite-500">Aucune tâche.</li>}
      </ul>
      {isAdmin && (
        <form className="flex gap-2 border-t border-beige p-3"
          onSubmit={(e) => { e.preventDefault(); const v = title.trim(); if (v) m.add.mutate([{ title: v, position: list.length + 1 }], { onSuccess: () => setTitle('') }); }}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nouvelle tâche…" aria-label="Nouvelle tâche" className="h-9" />
          <Button type="submit" size="sm" icon={<Plus className="h-4 w-4" />} loading={m.add.isPending} disabled={!title.trim()}>Ajouter</Button>
        </form>
      )}
    </Card>
  );
}

// --- Brief Claude ------------------------------------------------------------------------
function downloadText(name: string, content: string, type: string) {
  const blob = new Blob([content], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function BriefTab({ p }: { p: ProjectOverview }) {
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const briefs = useProjectBriefs(p.id);
  const q = useQuestionnaire(p.id);
  const files = useProjectFiles(p.id);
  const settings = useAppSettings();
  const save = useSaveBrief(p.id);
  const validate = useValidateBrief(p.id);
  const names = useTeamNames();
  const [selected, setSelected] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (briefs.isPending || q.isPending) return <Spinner />;
  if (briefs.isError) return <Alert>{humanizeError(briefs.error)}</Alert>;
  const list = briefs.data ?? [];
  const current = list.find((b) => b.id === selected) ?? list[0];
  const answers = (q.data?.answers ?? {}) as Answers;
  const missing = missingInfo(answers, (files.data ?? []).map((f) => ({ category: f.category })));

  const generate = () => {
    const content = generateBrief({
      companyName: p.company_name, offerCode: p.offer_code, withPlanningOption: p.with_planning_option,
      contractReference: p.contract_reference, targetDate: p.target_date, answers,
      files: (files.data ?? []).map((f) => ({ category: f.category, name: f.original_name })),
      deliveryDays: settings.data?.project_delivery_days ?? 10,
    });
    save.mutate(content, { onSuccess: () => setSelected(null) });
  };
  const copy = async () => {
    if (!current) return;
    try { await navigator.clipboard.writeText(current.content); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { setCopied(false); }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-terracotta" /> Brief de développement pour Claude</h2>
            <p className="mt-1 max-w-2xl text-sm text-anthracite-500">
              Cahier des charges généré à partir des réponses du questionnaire et des documents reçus, adapté au secteur du client.
              Il n’invente aucune prestation, aucun tarif ni aucun avis : ce qui manque est signalé « [À COMPLÉTER] ».
            </p>
            {q.data?.status !== 'recu' && <p className="mt-2 text-xs text-amber-800">Le questionnaire n’a pas encore été transmis : le brief sera incomplet.</p>}
            {missing.length > 0 && <p className="mt-1 text-xs text-anthracite-500">{missing.length} information{missing.length > 1 ? 's' : ''} manquante{missing.length > 1 ? 's' : ''} seront listées à la fin du brief.</p>}
          </div>
          {isAdmin && !isClosed(p) && (
            <Button icon={<Wand2 className="h-4 w-4" />} loading={save.isPending} onClick={generate}>
              {list.length ? 'Régénérer le brief' : 'Générer le brief de développement'}
            </Button>
          )}
        </div>
        {(save.isError || validate.isError) && <div className="mt-3"><Alert>{humanizeError(save.error ?? validate.error)}</Alert></div>}
      </Card>

      {!current ? (
        <Card><EmptyState icon={<Sparkles className="h-6 w-6" />} title="Aucun brief pour l’instant">{isAdmin ? 'Générez-le dès que le questionnaire est reçu.' : 'L’administrateur le générera à réception du questionnaire.'}</EmptyState></Card>
      ) : (
        <Card>
          <div className="flex flex-wrap items-center gap-2 border-b border-beige px-4 py-3">
            {list.length > 1 ? (
              <div className="w-56">
                <Select className="h-8 text-sm" value={current.id} onChange={(e) => setSelected(e.target.value)} aria-label="Version du brief">
                  {list.map((b) => <option key={b.id} value={b.id}>Version {b.version} · {formatDay(b.created_at)}{b.validated_at ? ' · validée' : ''}</option>)}
                </Select>
              </div>
            ) : <span className="text-sm font-medium">Version {current.version}</span>}
            <span className="text-xs text-anthracite-500">générée {formatDateTime(current.created_at)}{current.generated_by ? ` par ${names.get(current.generated_by) ?? '—'}` : ''}</span>
            {current.validated_at && <Badge tone="success">Validée le {formatDay(current.validated_at)}</Badge>}
            <div className="ml-auto flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" icon={copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />} onClick={() => void copy()}>
                {copied ? 'Copié !' : 'Copier le prompt'}
              </Button>
              <Button size="sm" variant="secondary" icon={<Download className="h-4 w-4" />}
                onClick={() => downloadText(briefFileName(p.company_name, current.version), current.content, 'text/markdown')}>Markdown</Button>
              <Button size="sm" variant="ghost" icon={<Download className="h-4 w-4" />}
                onClick={() => downloadText(briefFileName(p.company_name, current.version).replace(/\.md$/, '.txt'), current.content, 'text/plain')}>Texte</Button>
              {isAdmin && !current.validated_at && !isClosed(p) && (
                <Button size="sm" loading={validate.isPending} icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => validate.mutate(current.id)}>
                  Valider le brief
                </Button>
              )}
            </div>
          </div>
          {isAdmin && !current.validated_at && ['questionnaire_recu', 'brief_a_valider', 'en_attente_infos'].includes(p.status) && (
            <p className="border-b border-beige bg-creme px-4 py-2 text-xs text-anthracite-700">
              Valider le brief arrête le périmètre : le projet passe « Prêt à produire » et la date de livraison est fixée.
            </p>
          )}
          <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words px-4 py-4 font-mono text-[12.5px] leading-relaxed text-anthracite-700">{current.content}</pre>
        </Card>
      )}
    </div>
  );
}

// --- Historique --------------------------------------------------------------------------
function eventText(e: ProjectEventRow): string {
  if (e.kind === 'statut') {
    const from = e.from_value ? PROJECT_STATUS_LABELS[e.from_value as keyof typeof PROJECT_STATUS_LABELS] ?? e.from_value : '';
    const to = e.to_value ? PROJECT_STATUS_LABELS[e.to_value as keyof typeof PROJECT_STATUS_LABELS] ?? e.to_value : '';
    return `${from} → ${to}`;
  }
  return '';
}

export function HistoryTab({ p }: { p: ProjectOverview }) {
  const events = useProjectEvents(p.id);
  const names = useTeamNames();
  const add = useAddComment(p.id);
  const [body, setBody] = useState('');

  if (events.isPending) return <Spinner />;
  if (events.isError) return <Alert>{humanizeError(events.error)}</Alert>;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card>
        <ol className="divide-y divide-beige">
          {(events.data ?? []).map((e) => (
            <li key={e.id} className="flex gap-3 px-4 py-3">
              <span className={clsx('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                e.kind === 'commentaire' ? 'bg-terracotta-50 text-terracotta-700' : e.actor_id ? 'bg-beige text-anthracite-700' : 'bg-emerald-50 text-emerald-800')}>
                {e.kind === 'commentaire' ? <MessageSquare className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <p>
                  <span className="font-medium">{EVENT_LABELS[e.kind] ?? e.kind}</span>
                  {eventText(e) && <span className="text-anthracite-700"> · {eventText(e)}</span>}
                </p>
                {e.body && <p className="mt-0.5 whitespace-pre-line break-words text-anthracite-700">{e.body}</p>}
                <p className="mt-0.5 text-xs text-anthracite-500">
                  {formatDateTime(e.created_at)} · {e.actor_id ? names.get(e.actor_id) ?? 'Équipe' : 'Client (lien personnel)'}
                </p>
              </div>
            </li>
          ))}
          {(events.data ?? []).length === 0 && <li className="px-4 py-6 text-center text-sm text-anthracite-500">Aucun événement.</li>}
        </ol>
      </Card>
      <Card className="h-fit space-y-2 p-4">
        <h2 className="text-sm font-semibold">Ajouter un commentaire</h2>
        <Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} aria-label="Commentaire" placeholder="Échange avec le client, décision, point d’attention…" />
        {add.isError && <Alert>{humanizeError(add.error)}</Alert>}
        <div className="flex justify-end">
          <Button size="sm" loading={add.isPending} disabled={!body.trim()} onClick={() => add.mutate(body.trim(), { onSuccess: () => setBody('') })}>Publier</Button>
        </div>
        <p className="text-xs text-anthracite-500">Visible par l’équipe ayant accès au projet. Le commercial et l’administrateur sont notifiés.</p>
      </Card>
    </div>
  );
}

