import { useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  AlertTriangle, ArrowLeft, Check, Copy, ExternalLink, Link2, Mail, MessageCircle, Send, ShieldOff, Smartphone,
} from 'lucide-react';
import { formatDateTime, formatDay } from '@/lib/crm';
import { OFFER_LABELS } from '@/lib/sales';
import { humanizeError } from '@/lib/supabase';
import { useAuth } from '@/features/auth/AuthProvider';
import { useTeam } from '@/features/leads/api';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, Select, Spinner, Textarea } from '@/components/ui';
import type { ProjectOverview, ProjectStatus } from '@/types/database';
import {
  useCreateLink, useFlagMissing, useProject, useProjectLinks, useQuestionnaire, useRevokeLinks, useSetStatus, useUpdateProject,
} from './api';
import { CancelModal, DeliverModal, ProjectStatusBadge } from './components';
import {
  PROJECT_COLUMNS, PROJECT_STATUS_LABELS, QUESTIONNAIRE_LABELS, daysLeft, isClosed, suggestedAction,
} from './meta';
import { BriefTab, DocumentsTab, HistoryTab, ProductionTab, QuestionnaireTab } from './ProjectTabs';
import { DueBadge } from './ProjectsPage';

const TABS = [
  { id: 'resume', label: 'Résumé' },
  { id: 'questionnaire', label: 'Questionnaire' },
  { id: 'documents', label: 'Documents' },
  { id: 'production', label: 'Production' },
  { id: 'brief', label: 'Brief Claude' },
  { id: 'historique', label: 'Historique' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export function ProjectDetailPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some((t) => t.id === params.get('onglet')) ? params.get('onglet') : 'resume') as TabId;
  const project = useProject(id);

  if (project.isPending) return <Spinner />;
  if (project.isError) return <Alert>{humanizeError(project.error)}</Alert>;
  const p = project.data;
  if (!p) {
    return (
      <Card>
        <EmptyState title="Projet introuvable">
          Il n’existe pas ou ne vous est pas attribué. <Link to="/projets" className="text-terracotta-700 underline">Retour aux projets</Link>
        </EmptyState>
      </Card>
    );
  }

  return (
    <>
      <Link to="/projets" className="mb-4 inline-flex items-center gap-1 text-sm text-anthracite-500 hover:text-anthracite">
        <ArrowLeft className="h-4 w-4" /> Projets clients
      </Link>
      <div className="mb-5">
        <h1 className="font-display text-2xl font-semibold tracking-tight">{p.company_name}</h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-anthracite-500">
          <ProjectStatusBadge status={p.status} />
          <DueBadge p={p} />
          {p.contract_id && (
            <Link to={`/clients/${p.contract_id}`} className="text-terracotta-700 hover:underline">
              {p.contract_reference}{p.offer_code ? ` · ${OFFER_LABELS[p.offer_code]}` : ''}
            </Link>
          )}
          {p.owner_name && <><span aria-hidden>·</span><span>Commercial : {p.owner_name}</span></>}
        </div>
      </div>

      <div role="tablist" aria-label="Sections du projet" className="-mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-beige-300 px-4 sm:mx-0 sm:px-0">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id}
            onClick={() => { const n = new URLSearchParams(params); n.set('onglet', t.id); setParams(n, { replace: true }); }}
            className={clsx('-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors',
              tab === t.id ? 'border-terracotta font-medium text-anthracite' : 'border-transparent text-anthracite-500 hover:text-anthracite')}>
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === 'resume' && <SummaryTab p={p} />}
        {tab === 'questionnaire' && <QuestionnaireTab p={p} />}
        {tab === 'documents' && <DocumentsTab p={p} />}
        {tab === 'production' && <ProductionTab p={p} />}
        {tab === 'brief' && <BriefTab p={p} />}
        {tab === 'historique' && <HistoryTab p={p} />}
      </div>
    </>
  );
}

// --- Résumé ------------------------------------------------------------------------
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <dt className="text-anthracite-500">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

const STEP_SHORT: Record<ProjectStatus, string> = {
  en_attente_infos: 'Infos client', questionnaire_recu: 'Questionnaire', brief_a_valider: 'Brief', pret_a_produire: 'Prêt',
  en_creation: 'Création', en_validation_client: 'Validation', pret_a_publier: 'Publication', livre: 'Livré', annule: 'Annulé',
};

function Stepper({ status }: { status: ProjectStatus }) {
  const idx = PROJECT_COLUMNS.indexOf(status);
  return (
    <ol className="grid grid-cols-4 gap-x-1.5 gap-y-3 sm:grid-cols-8">
      {PROJECT_COLUMNS.map((s, i) => (
        <li key={s} className="min-w-0">
          <span className={clsx('block h-1.5 rounded-full', status === 'annule' ? 'bg-beige' : i <= idx ? 'bg-terracotta' : 'bg-beige')} />
          <span title={PROJECT_STATUS_LABELS[s]} className={clsx('mt-1.5 block truncate text-[11px] leading-tight', i === idx ? 'font-medium text-anthracite' : 'text-anthracite-500')}>
            {STEP_SHORT[s]}
          </span>
        </li>
      ))}
    </ol>
  );
}

function SummaryTab({ p }: { p: ProjectOverview }) {
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const closed = isClosed(p);
  const left = daysLeft(p);
  const q = useQuestionnaire(p.id);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <Card className="p-4 sm:p-5">
          <h2 className="mb-4 text-sm font-semibold">État d’avancement</h2>
          <Stepper status={p.status} />
          {p.status === 'annule' && <p className="mt-3 text-sm text-red-800">Projet annulé{p.cancel_reason ? ` : ${p.cancel_reason}` : ''}.</p>}
          <div className="mt-5 rounded-lg bg-creme px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-anthracite-500">Prochaine action</p>
            <p className="mt-0.5 text-sm font-medium text-anthracite">{suggestedAction(p) ?? (p.status === 'livre' ? 'Site livré 🎉' : '—')}</p>
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Questionnaire</h2>
            <Link to="?onglet=questionnaire" className="text-sm text-terracotta-700 hover:underline">Ouvrir</Link>
          </div>
          <dl className="divide-y divide-beige">
            <Row label="Statut">{p.questionnaire_status ? QUESTIONNAIRE_LABELS[p.questionnaire_status] : '—'}</Row>
            <Row label="Complétude">
              <span className="inline-flex items-center gap-2">
                <span className="h-1.5 w-24 overflow-hidden rounded-full bg-beige"><span className="block h-full bg-terracotta" style={{ width: `${p.completion_pct ?? 0}%` }} /></span>
                {p.completion_pct ?? 0} %
              </span>
            </Row>
            <Row label="Dernière saisie">{p.last_saved_at ? `${formatDateTime(p.last_saved_at)}${q.data?.last_saved_via === 'client' ? ' (client)' : q.data?.last_saved_via === 'equipe' ? ' (équipe)' : ''}` : '—'}</Row>
            {p.submitted_at && <Row label="Transmis le">{formatDateTime(p.submitted_at)}</Row>}
            <Row label="Documents reçus">{p.files_count}</Row>
          </dl>
          {!closed && <MissingInfoButton p={p} />}
        </Card>

        {isAdmin && !closed && <AdminProjectCard p={p} />}
      </div>

      <div className="space-y-4">
        <Card className="p-4">
          <h2 className="mb-2 text-sm font-semibold">Projet</h2>
          <dl className="divide-y divide-beige">
            <Row label="Client">{p.company_name}</Row>
            <Row label="Offre">{p.offer_code ? `${OFFER_LABELS[p.offer_code]}${p.with_planning_option ? ' + planning' : ''}` : '—'}</Row>
            <Row label="Créé le">{formatDay(p.created_at)}</Row>
            <Row label="Responsable production">{p.assignee_name ?? '—'}</Row>
            <Row label="Livraison estimée">
              {p.target_date ? (
                <span className={clsx(p.is_late && 'text-red-700')}>{formatDay(p.target_date)}{left !== null && !closed ? (left < 0 ? ` (retard ${-left} j)` : '') : ''}</span>
              ) : p.status === 'livre' ? '—' : <span className="font-normal text-anthracite-500">7 à 10 j après validation du périmètre</span>}
            </Row>
            {p.delivered_at && <Row label="Livré le">{formatDay(p.delivered_at)}</Row>}
            {p.site_url && (
              <Row label="Site">
                <a href={p.site_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-terracotta-700 hover:underline">
                  Ouvrir <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Row>
            )}
          </dl>
        </Card>
        {!closed && <ClientLinkCard p={p} />}
      </div>
    </div>
  );
}

function MissingInfoButton({ p }: { p: ProjectOverview }) {
  const flag = useFlagMissing(p.id);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  return (
    <>
      <Button size="sm" variant="secondary" className="mt-3" icon={<AlertTriangle className="h-4 w-4" />}
        onClick={() => { flag.reset(); setMsg(''); setOpen(true); }}>
        Demander des compléments
      </Button>
      <Modal
        open={open} onClose={flag.isPending ? () => undefined : () => setOpen(false)}
        title="Demander des compléments au client"
        description="Le message s’affiche en haut du questionnaire du client. Si le questionnaire avait été transmis, il est rouvert."
        footer={(
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={flag.isPending}>Annuler</Button>
            <Button loading={flag.isPending} disabled={!msg.trim()} onClick={() => flag.mutate(msg.trim(), { onSuccess: () => setOpen(false) })}>Enregistrer la demande</Button>
          </>
        )}
      >
        <div className="space-y-3 text-sm">
          <Field label="Informations attendues">
            {(id) => <Textarea id={id} rows={4} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Ex. Merci d’ajouter vos tarifs et 3 à 5 photos de l’institut." />}
          </Field>
          <p className="text-xs text-anthracite-500">Aucun email n’est envoyé automatiquement : prévenez le client (email, SMS) en lui renvoyant son lien.</p>
          {flag.isError && <Alert>{humanizeError(flag.error)}</Alert>}
        </div>
      </Modal>
    </>
  );
}

function AdminProjectCard({ p }: { p: ProjectOverview }) {
  const team = useTeam(true);
  const update = useUpdateProject(p.id);
  const setStatus = useSetStatus(p.id);
  const [form, setForm] = useState({ next_action: p.next_action ?? '', target_date: p.target_date ?? '', assignee_id: p.assignee_id ?? '' });
  const [next, setNext] = useState<ProjectStatus | ''>('');
  const [note, setNote] = useState('');
  const [modal, setModal] = useState<'livre' | 'annule' | null>(null);
  const dirty = form.next_action !== (p.next_action ?? '') || form.target_date !== (p.target_date ?? '') || form.assignee_id !== (p.assignee_id ?? '');

  const apply = () => {
    if (!next) return;
    if (next === 'livre' || next === 'annule') { setModal(next); return; }
    setStatus.mutate({ status: next, note: note.trim() || null }, { onSuccess: () => { setNext(''); setNote(''); } });
  };

  return (
    <Card className="space-y-4 p-4 sm:p-5">
      <h2 className="text-sm font-semibold">Pilotage (administrateur)</h2>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <Field label="Changer le statut">
          {(id) => (
            <Select id={id} value={next} onChange={(e) => setNext(e.target.value as ProjectStatus | '')}>
              <option value="">Choisir…</option>
              {[...PROJECT_COLUMNS, 'annule' as const].filter((s) => s !== p.status).map((s) => <option key={s} value={s}>{PROJECT_STATUS_LABELS[s]}</option>)}
            </Select>
          )}
        </Field>
        <div className="flex items-end"><Button onClick={apply} disabled={!next} loading={setStatus.isPending}>Appliquer</Button></div>
      </div>
      {next && next !== 'livre' && next !== 'annule' && (
        <Field label="Note (facultatif, visible dans l’historique)">{(id) => <Input id={id} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      )}
      {next === 'pret_a_produire' && !p.target_date && (
        <p className="text-xs text-anthracite-500">La date de livraison sera fixée automatiquement (délai défini dans les paramètres, 10 jours par défaut).</p>
      )}
      {setStatus.isError && <Alert>{humanizeError(setStatus.error)}</Alert>}

      <div className="grid gap-3 border-t border-beige pt-4 sm:grid-cols-2">
        <Field label="Responsable production">
          {(id) => (
            <Select id={id} value={form.assignee_id} onChange={(e) => setForm({ ...form, assignee_id: e.target.value })}>
              <option value="">Non attribué</option>
              {(team.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Date de livraison prévue">
          {(id) => <Input id={id} type="date" value={form.target_date} onChange={(e) => setForm({ ...form, target_date: e.target.value })} />}
        </Field>
        <div className="sm:col-span-2">
          <Field label="Prochaine action (sinon suggestion automatique)">
            {(id) => <Input id={id} value={form.next_action} maxLength={300} onChange={(e) => setForm({ ...form, next_action: e.target.value })} placeholder={suggestedAction({ ...p, next_action: null }) ?? ''} />}
          </Field>
        </div>
      </div>
      {update.isError && <Alert>{humanizeError(update.error)}</Alert>}
      {dirty && (
        <div className="flex justify-end">
          <Button size="sm" loading={update.isPending}
            onClick={() => update.mutate({ next_action: form.next_action, target_date: form.target_date, assignee_id: form.assignee_id })}>
            Enregistrer
          </Button>
        </div>
      )}
      {modal === 'livre' && <DeliverModal project={p} onClose={() => { setModal(null); setNext(''); }} />}
      {modal === 'annule' && <CancelModal project={p} onClose={() => { setModal(null); setNext(''); }} />}
    </Card>
  );
}

// --- Lien client --------------------------------------------------------------------
export function portalUrl(token: string) {
  return `${window.location.origin}/projet/${token}`;
}

function ClientLinkCard({ p }: { p: ProjectOverview }) {
  const links = useProjectLinks(p.id);
  const q = useQuestionnaire(p.id);
  const create = useCreateLink(p.id);
  const revoke = useRevokeLinks(p.id);
  const [fresh, setFresh] = useState<{ url: string; expires_at: string } | null>(null);
  const [confirmNew, setConfirmNew] = useState(false);
  const active = (links.data ?? []).find((l) => !l.revoked_at && new Date(l.expires_at) > new Date());
  const clientEmail = typeof q.data?.answers?.email_public === 'string' ? q.data.answers.email_public : '';

  const generate = () => {
    setConfirmNew(false);
    create.mutate(undefined, { onSuccess: (r) => setFresh({ url: portalUrl(r.token), expires_at: r.expires_at }) });
  };

  return (
    <Card className="space-y-3 p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold"><Link2 className="h-4 w-4 text-terracotta" /> Questionnaire client</h2>
      {active ? (
        <div className="space-y-1 text-sm">
          <Badge tone="success">Lien actif</Badge>
          <p className="text-xs text-anthracite-500">
            Valable jusqu’au {formatDay(active.expires_at)} · {active.use_count > 0 ? `ouvert ${active.use_count} fois, dernière fois ${formatDateTime(active.last_used_at!)}` : 'pas encore ouvert'}
          </p>
        </div>
      ) : (
        <p className="text-sm text-anthracite-500">
          Générez un lien personnel : le client remplit le questionnaire sans créer de compte, en plusieurs fois s’il le souhaite.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={<Send className="h-4 w-4" />} loading={create.isPending}
          onClick={() => (active ? setConfirmNew(true) : generate())}>
          {active ? 'Nouveau lien' : 'Envoyer le questionnaire'}
        </Button>
        {active && (
          <Button size="sm" variant="ghost" icon={<ShieldOff className="h-4 w-4" />} loading={revoke.isPending} onClick={() => revoke.mutate()}>
            Désactiver
          </Button>
        )}
      </div>
      {(create.isError || revoke.isError) && <Alert>{humanizeError(create.error ?? revoke.error)}</Alert>}
      <p className="text-xs text-anthracite-500">
        Pour des raisons de sécurité, un lien n’est affiché qu’au moment de sa création. Si vous l’avez perdu, créez-en un nouveau : l’ancien est désactivé, les réponses sont conservées.
      </p>

      <Modal open={confirmNew} onClose={() => setConfirmNew(false)} title="Créer un nouveau lien ?"
        description="Le lien actuel ne fonctionnera plus. Les réponses déjà saisies par le client sont conservées."
        footer={<><Button variant="secondary" onClick={() => setConfirmNew(false)}>Annuler</Button><Button onClick={generate}>Créer le lien</Button></>}>
        <span />
      </Modal>

      {fresh && <ShareLinkModal url={fresh.url} expiresAt={fresh.expires_at} company={p.company_name} email={clientEmail} onClose={() => setFresh(null)} />}
    </Card>
  );
}

function ShareLinkModal({ url, expiresAt, company, email, onClose }: { url: string; expiresAt: string; company: string; email: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const message =
    `Bonjour,\n\nPour préparer votre site internet, merci de remplir ce questionnaire (environ 15 minutes, enregistrement automatique, vous pouvez le compléter en plusieurs fois) :\n${url}\n\n` +
    `Vous pourrez aussi y déposer votre logo et vos photos.\n\nÀ très vite,\nMoka Studio`;
  const subject = `Votre projet de site internet — ${company}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); } catch { setCopied(false); }
  };
  return (
    <Modal open onClose={onClose} title="Lien du questionnaire" description={`Valable jusqu’au ${formatDay(expiresAt)}. Copiez-le maintenant : il ne sera plus affiché.`}
      footer={<Button onClick={onClose}>Terminé</Button>}>
      <div className="space-y-4 text-sm">
        <div className="flex gap-2">
          <Input readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Lien du questionnaire" className="font-mono text-xs" />
          <Button variant="secondary" icon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} onClick={() => void copy()}>
            {copied ? 'Copié' : 'Copier'}
          </Button>
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-anthracite-500">Envoyer depuis vos applications</p>
          <div className="flex flex-wrap gap-2">
            <a className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-beige-300 px-3 font-medium text-anthracite-700 hover:bg-creme"
              href={`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`}>
              <Mail className="h-4 w-4" /> Email
            </a>
            <a className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-beige-300 px-3 font-medium text-anthracite-700 hover:bg-creme"
              href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </a>
            <a className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-beige-300 px-3 font-medium text-anthracite-700 hover:bg-creme"
              href={`sms:?&body=${encodeURIComponent(message)}`}>
              <Smartphone className="h-4 w-4" /> SMS
            </a>
          </div>
          <p className="mt-2 text-xs text-anthracite-500">Ces boutons ouvrent votre propre messagerie : rien n’est envoyé automatiquement par le CRM.</p>
        </div>
      </div>
    </Modal>
  );
}
