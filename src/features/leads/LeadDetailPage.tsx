import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useForm, type UseFormRegister } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { clsx } from 'clsx';
import {
  ArrowLeft, CalendarClock, Globe, Mail, MapPin, MessageSquare, Pencil, Phone, Plus, StickyNote,
} from 'lucide-react';
import {
  ACTIVITY_LABELS, LEAD_STATUSES, LOGGABLE_ACTIVITIES, SOURCE_LABELS, STATUS_LABELS, contactName, dateInputToIso,
  formatAgo, formatDateTime, isoToDateInput, telHref, type LoggableActivity,
} from '@/lib/crm';
import { humanizeError } from '@/lib/supabase';
import { useAuth } from '@/features/auth/AuthProvider';
import { TaskItem } from '@/features/tasks/TaskItem';
import { TaskModal } from '@/features/tasks/TaskModal';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Select, Spinner, Textarea } from '@/components/ui';
import {
  useLead, useLogActivity, useTasks, useTeam, useTimeline, useUpdateCompanyAndContact, useUpdateLead, useUpdateLeadStatus,
} from './api';
import { FollowUpBadge, LostReasonModal, StatusPill } from './components';
import { CompanyContactFields, companyContactSchema, type CompanyContactValues } from './LeadForm';
import { ConvertModal } from '@/features/sales/ConvertModal';
import { useContractForLead } from '@/features/sales/api';
import { ProjectButton } from '@/features/projects/components';
import type { LeadOverview, LeadStatus, TaskOverview, TimelineEntry } from './types';

const nn = (v?: string) => (v && v.trim() ? v.trim() : null);

function websiteHref(w: string) {
  return /^https?:\/\//i.test(w) ? w : `https://${w}`;
}

// --- Coordonnées ------------------------------------------------------------
function ContactCard({ lead }: { lead: LeadOverview }) {
  const [editing, setEditing] = useState(false);
  const update = useUpdateCompanyAndContact(lead);
  const form = useForm<CompanyContactValues>({ resolver: zodResolver(companyContactSchema) });

  const start = () => {
    update.reset();
    form.reset({
      name: lead.company_name, siren: lead.siren ?? '', sector: lead.sector ?? '', address: lead.address ?? '',
      postal_code: lead.postal_code ?? '', city: lead.city ?? '', website: lead.website ?? '',
      first_name: lead.contact_first_name ?? '', last_name: lead.contact_last_name ?? '',
      email: lead.contact_email ?? '', phone: lead.contact_phone ?? '', notes: '',
    });
    setEditing(true);
  };

  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await update.mutateAsync({
        company: {
          name: v.name.trim(), siren: nn(v.siren?.replace(/\s/g, '')), sector: nn(v.sector), address: nn(v.address),
          postal_code: nn(v.postal_code), city: nn(v.city), website: nn(v.website),
        },
        contact: { first_name: nn(v.first_name), last_name: nn(v.last_name), email: nn(v.email), phone: nn(v.phone) },
      });
      setEditing(false);
    } catch { /* affiché */ }
  });

  if (editing) {
    return (
      <Card className="p-4">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <CompanyContactFields register={form.register as UseFormRegister<CompanyContactValues>} errors={form.formState.errors} />
          {update.isError && <Alert>{humanizeError(update.error)}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(false)} disabled={form.formState.isSubmitting}>Annuler</Button>
            <Button type="submit" loading={form.formState.isSubmitting}>Enregistrer</Button>
          </div>
        </form>
      </Card>
    );
  }

  const contact = contactName(lead.contact_first_name, lead.contact_last_name);
  const address = [lead.address, [lead.postal_code, lead.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Coordonnées</h2>
        <Button size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" />} onClick={start}>Modifier</Button>
      </div>
      <dl className="space-y-2.5 text-sm">
        {contact && (
          <div>
            <dt className="text-xs text-anthracite-500">Contact</dt>
            <dd className="font-medium">{contact}</dd>
          </div>
        )}
        {lead.contact_phone && (
          <a href={telHref(lead.contact_phone)} className="flex items-center gap-2 text-terracotta-700 hover:underline">
            <Phone className="h-4 w-4" aria-hidden />{lead.contact_phone}
          </a>
        )}
        {lead.contact_email && (
          <a href={`mailto:${lead.contact_email}`} className="flex items-center gap-2 break-all text-terracotta-700 hover:underline">
            <Mail className="h-4 w-4 shrink-0" aria-hidden />{lead.contact_email}
          </a>
        )}
        {lead.website && (
          <a href={websiteHref(lead.website)} target="_blank" rel="noreferrer" className="flex items-center gap-2 break-all text-terracotta-700 hover:underline">
            <Globe className="h-4 w-4 shrink-0" aria-hidden />{lead.website.replace(/^https?:\/\//, '')}
          </a>
        )}
        {address && <p className="flex items-start gap-2 text-anthracite-700"><MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{address}</p>}
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-beige pt-2.5 text-xs text-anthracite-500">
          {lead.sector && <span>Secteur : {lead.sector}</span>}
          {lead.siren && <span>SIREN : {lead.siren}</span>}
          <span>Source : {SOURCE_LABELS[lead.source]}</span>
          {lead.referrer_name && <span>Apporteur : {lead.referrer_name}</span>}
        </div>
        {!contact && !lead.contact_phone && !lead.contact_email && (
          <p className="text-anthracite-500">Aucun contact renseigné.</p>
        )}
      </dl>
    </Card>
  );
}

// --- Suivi (relance, notes, responsable) ------------------------------------
function FollowUpCard({ lead }: { lead: LeadOverview }) {
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const team = useTeam(isAdmin);
  const update = useUpdateLead(lead.id);
  const [notes, setNotes] = useState(lead.notes ?? '');
  useEffect(() => setNotes(lead.notes ?? ''), [lead.notes]);

  return (
    <Card className="space-y-4 p-4">
      <h2 className="text-sm font-semibold">Suivi</h2>
      <Field label="Prochaine relance">
        {(id) => (
          <div className="flex items-center gap-2">
            <Input
              id={id}
              type="date"
              defaultValue={isoToDateInput(lead.next_follow_up_at)}
              key={lead.next_follow_up_at ?? 'none'}
              onChange={(e) => update.mutate({ next_follow_up_at: dateInputToIso(e.target.value) })}
            />
            {lead.next_follow_up_at && (
              <Button size="sm" variant="ghost" onClick={() => update.mutate({ next_follow_up_at: null })}>Effacer</Button>
            )}
          </div>
        )}
      </Field>
      {isAdmin ? (
        <Field label="Commercial responsable">
          {(id) => (
            <Select id={id} value={lead.owner_id ?? ''} onChange={(e) => update.mutate({ owner_id: e.target.value || null })}>
              <option value="">Non attribué</option>
              {team.data?.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </Select>
          )}
        </Field>
      ) : (
        <p className="text-xs text-anthracite-500">Responsable : {lead.owner_name ?? 'vous'}</p>
      )}
      <Field label="Notes internes">
        {(id) => <Textarea id={id} rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />}
      </Field>
      {notes !== (lead.notes ?? '') && (
        <div className="flex justify-end">
          <Button size="sm" loading={update.isPending} onClick={() => update.mutate({ notes: notes.trim() || null })}>
            Enregistrer les notes
          </Button>
        </div>
      )}
      {update.isError && <Alert>{humanizeError(update.error)}</Alert>}
    </Card>
  );
}

// --- Historique ---------------------------------------------------------------
const LOG_ICONS: Record<LoggableActivity, typeof Phone> = {
  note: StickyNote, appel: Phone, email: Mail, sms: MessageSquare, rendez_vous: CalendarClock,
};

function describe(e: TimelineEntry): string {
  if (e.kind === 'changement_statut') {
    const from = e.from_value ? STATUS_LABELS[e.from_value as LeadStatus] ?? e.from_value : '';
    const to = e.to_value ? STATUS_LABELS[e.to_value as LeadStatus] ?? e.to_value : '';
    return `${from} → ${to}`;
  }
  if (e.kind === 'changement_responsable') return `${e.from_value} → ${e.to_value}`;
  return '';
}

function Timeline({ leadId }: { leadId: string }) {
  const { profile } = useAuth();
  const timeline = useTimeline(leadId);
  const log = useLogActivity(leadId, profile?.id ?? '');
  const [kind, setKind] = useState<LoggableActivity>('appel');
  const [body, setBody] = useState('');

  const submit = () => {
    if (kind === 'note' && !body.trim()) return;
    log.mutate({ kind, body }, { onSuccess: () => setBody('') });
  };

  return (
    <Card>
      <div className="border-b border-beige p-4">
        <h2 className="mb-3 text-sm font-semibold">Consigner un échange</h2>
        <div className="mb-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Type d’échange">
          {LOGGABLE_ACTIVITIES.map((k) => {
            const Icon = LOG_ICONS[k];
            return (
              <button
                key={k}
                role="radio"
                aria-checked={kind === k}
                onClick={() => setKind(k)}
                className={clsx(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs',
                  kind === k ? 'border-terracotta bg-terracotta-50 text-terracotta-700' : 'border-beige-300 hover:bg-creme',
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />{ACTIVITY_LABELS[k]}
              </button>
            );
          })}
        </div>
        <Textarea
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={kind === 'note' ? 'Votre note…' : 'Résumé (facultatif) : ce qui a été dit, la suite prévue…'}
          aria-label="Détail de l’échange"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-xs text-anthracite-500">
            {kind !== 'note' && 'Met à jour la date du dernier contact.'}
          </p>
          <Button size="sm" onClick={submit} loading={log.isPending} disabled={kind === 'note' && !body.trim()}>Ajouter</Button>
        </div>
        {log.isError && <div className="mt-2"><Alert>{humanizeError(log.error)}</Alert></div>}
      </div>

      {timeline.isPending ? (
        <Spinner />
      ) : timeline.isError ? (
        <div className="p-4"><Alert>{humanizeError(timeline.error)}</Alert></div>
      ) : (
        <ol className="px-4 py-2">
          {timeline.data.map((e) => {
            const detail = describe(e);
            const system = e.kind === 'creation' || e.kind === 'changement_statut' || e.kind === 'changement_responsable';
            return (
              <li key={e.id} className="relative border-l border-beige py-2.5 pl-5">
                <span
                  className={clsx('absolute -left-[5px] top-4 h-2.5 w-2.5 rounded-full ring-2 ring-white', system ? 'bg-beige-300' : 'bg-terracotta')}
                  aria-hidden
                />
                <p className="text-sm">
                  <span className={clsx(system ? 'text-anthracite-500' : 'font-medium')}>{ACTIVITY_LABELS[e.kind]}</span>
                  {detail && <span className="text-anthracite-700"> · {detail}</span>}
                </p>
                {e.body && <p className="mt-0.5 whitespace-pre-line text-sm text-anthracite-700">{e.body}</p>}
                <p className="mt-0.5 text-xs text-anthracite-300">
                  {formatDateTime(e.occurred_at)}{e.actor_name ? ` · ${e.actor_name}` : ''}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

// --- Tâches du prospect ---------------------------------------------------------
function LeadTasks({ lead }: { lead: LeadOverview }) {
  const tasks = useTasks({ leadId: lead.id });
  const [modal, setModal] = useState<{ open: boolean; task: TaskOverview | null }>({ open: false, task: null });
  const open = tasks.data?.filter((t) => t.status === 'a_faire' || t.status === 'en_cours') ?? [];
  const done = tasks.data?.filter((t) => t.status === 'fait').slice(-3) ?? [];

  return (
    <Card>
      <div className="flex items-center justify-between px-4 pb-1 pt-4">
        <h2 className="text-sm font-semibold">Tâches</h2>
        <Button size="sm" variant="ghost" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setModal({ open: true, task: null })}>
          Ajouter
        </Button>
      </div>
      {tasks.isPending ? (
        <Spinner />
      ) : open.length + done.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-anthracite-500">Aucune tâche planifiée.</p>
      ) : (
        <ul className="divide-y divide-beige">
          {[...open, ...done].map((t) => (
            <TaskItem key={t.id} task={t} showCompany={false} onEdit={(task) => setModal({ open: true, task })} />
          ))}
        </ul>
      )}
      <TaskModal
        open={modal.open}
        task={modal.task}
        leadId={lead.id}
        companyName={lead.company_name}
        onClose={() => setModal({ open: false, task: null })}
      />
    </Card>
  );
}

// --- Page -----------------------------------------------------------------------
export function LeadDetailPage() {
  const { id = '' } = useParams();
  const lead = useLead(id);
  const updateStatus = useUpdateLeadStatus();
  const [lostOpen, setLostOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const contract = useContractForLead(id);
  const existing = contract.data?.[0];

  if (lead.isPending) return <Spinner />;
  if (lead.isError) return <Alert>{humanizeError(lead.error)}</Alert>;
  const l = lead.data;
  if (!l) {
    return (
      <Card>
        <EmptyState title="Prospect introuvable">
          Il n’existe pas ou ne vous est pas attribué. <Link to="/prospects" className="text-terracotta-700 underline">Retour aux prospects</Link>
        </EmptyState>
      </Card>
    );
  }

  const changeStatus = (s: LeadStatus) => {
    if (s === l.status) return;
    if (s === 'perdu') setLostOpen(true);
    else updateStatus.mutate({ id: l.id, status: s });
  };

  return (
    <>
      <Link to="/prospects" className="mb-4 inline-flex items-center gap-1 text-sm text-anthracite-500 hover:text-anthracite">
        <ArrowLeft className="h-4 w-4" /> Prospects
      </Link>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight">{l.company_name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-anthracite-500">
            <StatusPill status={l.status} />
            <span aria-hidden>·</span>
            <span>depuis {formatAgo(l.status_changed_at)}</span>
            {l.city && <><span aria-hidden>·</span><span>{l.city}</span></>}
            <FollowUpBadge iso={l.next_follow_up_at} />
          </div>
          {l.status === 'perdu' && l.lost_reason && <div className="mt-2"><Badge tone="danger">Motif : {l.lost_reason}</Badge></div>}
        </div>
        <div className="flex flex-wrap gap-2">
          {existing && l.status === 'gagne' && <ProjectButton contractId={existing.id} label="Créer un projet client" className="[&_button]:h-10" />}
          {existing ? (
            <Link
              to={`/clients/${existing.id}`}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-medium text-white hover:bg-emerald-800"
            >
              Client · {existing.reference}
            </Link>
          ) : l.status !== 'perdu' && !contract.isPending ? (
            <Button onClick={() => setConvertOpen(true)}>Convertir en client</Button>
          ) : null}
          {l.contact_phone && (
            <a
              href={telHref(l.contact_phone)}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-beige-300 bg-white px-4 text-sm font-medium hover:bg-creme sm:hidden"
            >
              <Phone className="h-4 w-4" /> Appeler
            </a>
          )}
          <Select value={l.status} onChange={(e) => changeStatus(e.target.value as LeadStatus)} className="sm:!w-64" aria-label="Changer le statut">
            {LEAD_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </Select>
        </div>
      </div>
      {updateStatus.isError && !lostOpen && <div className="mb-4"><Alert>{humanizeError(updateStatus.error)}</Alert></div>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="order-2 space-y-4 lg:order-1">
          <LeadTasks lead={l} />
          <Timeline leadId={l.id} />
        </div>
        <div className="order-1 space-y-4 lg:order-2">
          <ContactCard lead={l} />
          <FollowUpCard lead={l} />
        </div>
      </div>

      <ConvertModal open={convertOpen} onClose={() => setConvertOpen(false)} leadId={l.id} companyName={l.company_name} />
      <LostReasonModal
        open={lostOpen}
        companyName={l.company_name}
        loading={updateStatus.isPending}
        error={lostOpen && updateStatus.isError ? updateStatus.error : undefined}
        onCancel={() => { setLostOpen(false); updateStatus.reset(); }}
        onConfirm={(reason) =>
          updateStatus.mutate({ id: l.id, status: 'perdu', lostReason: reason }, { onSuccess: () => setLostOpen(false) })
        }
      />
    </>
  );
}
