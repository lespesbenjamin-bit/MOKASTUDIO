import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { FolderKanban, Plus } from 'lucide-react';
import { humanizeError } from '@/lib/supabase';
import { Alert, Button, Field, Input, Modal, Textarea } from '@/components/ui';
import type { ProjectOverview, ProjectStatus } from '@/types/database';
import { useCreateProject, useProjectForContract, useSetStatusAny } from './api';
import { PROJECT_STATUS_DOT, PROJECT_STATUS_LABELS } from './meta';

export function ProjectStatusBadge({ status, className }: { status: ProjectStatus; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-white px-2 py-0.5 text-xs font-medium text-anthracite-700 ring-1 ring-beige-300', className)}>
      <span className={clsx('h-2 w-2 rounded-full', PROJECT_STATUS_DOT[status])} aria-hidden />
      {PROJECT_STATUS_LABELS[status]}
    </span>
  );
}

const normalizeUrl = (v: string) => {
  const s = v.trim();
  if (!s) return '';
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
};

/** Passage à « Livré » : adresse du site obligatoire (elle est reportée sur le contrat). */
export function DeliverModal({ project, onClose }: { project: Pick<ProjectOverview, 'id' | 'company_name' | 'site_url'>; onClose: () => void }) {
  const setStatus = useSetStatusAny();
  const [url, setUrl] = useState(project.site_url ?? '');
  const [note, setNote] = useState('');
  const clean = normalizeUrl(url);
  const valid = /^https?:\/\/[^\s.]+\.[^\s]{2,}$/i.test(clean);
  return (
    <Modal
      open onClose={setStatus.isPending ? () => undefined : onClose}
      title="Livrer le site" description={project.company_name}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={setStatus.isPending}>Annuler</Button>
          <Button loading={setStatus.isPending} disabled={!valid}
            onClick={() => setStatus.mutate({ id: project.id, status: 'livre', siteUrl: clean, note: note.trim() || null }, { onSuccess: onClose })}>
            Confirmer la livraison
          </Button>
        </>
      )}
    >
      <div className="space-y-3 text-sm">
        <p className="text-anthracite-700">
          Le contrat passe « site en ligne » : s’il s’agit d’un abonnement non encore activé, il est activé aujourd’hui.
          Le lien du questionnaire client est désactivé. Ce statut est définitif.
        </p>
        <Field label="Adresse du site en ligne">
          {(id) => <Input id={id} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.client.fr" />}
        </Field>
        <Field label="Note (facultatif)">{(id) => <Textarea id={id} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
        {setStatus.isError && <Alert>{humanizeError(setStatus.error)}</Alert>}
      </div>
    </Modal>
  );
}

export function CancelModal({ project, onClose }: { project: Pick<ProjectOverview, 'id' | 'company_name'>; onClose: () => void }) {
  const setStatus = useSetStatusAny();
  const [reason, setReason] = useState('');
  return (
    <Modal
      open onClose={setStatus.isPending ? () => undefined : onClose}
      title="Annuler le projet" description={project.company_name}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={setStatus.isPending}>Retour</Button>
          <Button variant="danger" loading={setStatus.isPending} disabled={!reason.trim()}
            onClick={() => setStatus.mutate({ id: project.id, status: 'annule', note: reason.trim() }, { onSuccess: onClose })}>
            Annuler le projet
          </Button>
        </>
      )}
    >
      <div className="space-y-3 text-sm">
        <p className="text-anthracite-700">Le projet est archivé (statut définitif) et le lien client désactivé. Le contrat n’est pas modifié.</p>
        <Field label="Motif">{(id) => <Textarea id={id} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
        {setStatus.isError && <Alert>{humanizeError(setStatus.error)}</Alert>}
      </div>
    </Modal>
  );
}

/** Bouton des fiches contrat / prospect gagné : ouvre le projet existant ou en crée un. */
export function ProjectButton({ contractId, label = 'Créer une fiche projet', className }: { contractId: string; label?: string; className?: string }) {
  const existing = useProjectForContract(contractId);
  const create = useCreateProject();
  const navigate = useNavigate();
  if (existing.isPending) return null;
  if (existing.data) {
    return (
      <Link to={`/projets/${existing.data.id}`}
        className={clsx('inline-flex h-9 items-center gap-2 rounded-lg border border-beige-300 bg-white px-3 text-sm font-medium text-anthracite-700 hover:bg-creme', className)}>
        <FolderKanban className="h-4 w-4 text-terracotta" /> Projet : {PROJECT_STATUS_LABELS[existing.data.status as ProjectStatus]}
      </Link>
    );
  }
  return (
    <div className={className}>
      <Button size="sm" icon={<Plus className="h-4 w-4" />} loading={create.isPending}
        onClick={() => create.mutate(contractId, { onSuccess: (id) => navigate(`/projets/${id}?onglet=questionnaire`) })}>
        {label}
      </Button>
      {create.isError && <p className="mt-1 text-xs text-red-700">{humanizeError(create.error)}</p>}
    </div>
  );
}
