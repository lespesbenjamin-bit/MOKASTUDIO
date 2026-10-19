import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { AlertTriangle } from 'lucide-react';
import { STATUS_DOT, STATUS_LABELS, daysFromToday, formatDay } from '@/lib/crm';
import { humanizeError } from '@/lib/supabase';
import type { DuplicateMatch, LeadStatus } from './types';
import { Alert, Button, Field, Modal, Textarea } from '@/components/ui';

export function StatusPill({ status, className }: { status: LeadStatus; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-anthracite-700', className)}>
      <span className={clsx('h-2 w-2 shrink-0 rounded-full', STATUS_DOT[status])} aria-hidden />
      {STATUS_LABELS[status]}
    </span>
  );
}

/** « Relance demain », en rouge si dépassée */
export function FollowUpBadge({ iso, compact }: { iso: string | null; compact?: boolean }) {
  if (!iso) return null;
  const diff = daysFromToday(iso);
  const tone =
    diff < 0 ? 'bg-red-50 text-red-800' : diff === 0 ? 'bg-amber-50 text-amber-800' : 'bg-creme text-anthracite-500';
  return (
    <span className={clsx('inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium', tone)}>
      {compact ? '' : diff < 0 ? 'Relance en retard · ' : 'Relance · '}
      {formatDay(iso)}
    </span>
  );
}

export function LostReasonModal({
  open, companyName, onCancel, onConfirm, loading, error,
}: {
  open: boolean; companyName?: string; loading?: boolean; error?: unknown;
  onCancel: () => void; onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (open) { setReason(''); setTouched(false); }
  }, [open]);
  const invalid = touched && !reason.trim();

  return (
    <Modal
      open={open}
      onClose={loading ? () => undefined : onCancel}
      title="Marquer comme perdu"
      description={companyName}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>Annuler</Button>
          <Button
            variant="danger"
            loading={loading}
            onClick={() => { setTouched(true); if (reason.trim()) onConfirm(reason.trim()); }}
          >
            Confirmer
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {['Budget', 'Déjà équipé', 'Pas le bon moment', 'Sans réponse', 'Concurrent'].map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r)}
              className={clsx(
                'rounded-full border px-2.5 py-1 text-xs',
                reason === r ? 'border-terracotta bg-terracotta-50 text-terracotta-700' : 'border-beige-300 hover:bg-creme',
              )}
            >
              {r}
            </button>
          ))}
        </div>
        <Field label="Motif" error={invalid ? 'Le motif est obligatoire' : undefined}>
          {(id) => <Textarea id={id} rows={2} value={reason} invalid={invalid} onChange={(e) => setReason(e.target.value)} />}
        </Field>
        {error ? <Alert>{humanizeError(error)}</Alert> : null}
      </div>
    </Modal>
  );
}

const MATCH_LABELS: Record<DuplicateMatch['match_kind'], string> = {
  siren: 'même SIREN', email: 'même email', telephone: 'même téléphone', site: 'même site internet',
};

export function DuplicateWarning({ matches, isAdmin }: { matches: DuplicateMatch[]; isAdmin: boolean }) {
  if (!matches.length) return null;
  const blocking = matches.some((m) => m.is_blocking);
  return (
    <div className={clsx('rounded-lg border px-3 py-2.5 text-sm', blocking ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50')}>
      <p className={clsx('flex items-center gap-2 font-medium', blocking ? 'text-red-800' : 'text-amber-900')}>
        <AlertTriangle className="h-4 w-4" aria-hidden />
        {blocking ? 'Ce prospect existe déjà' : 'Prospect peut-être déjà connu'}
      </p>
      <ul className="mt-1.5 space-y-1 text-anthracite-700">
        {matches.map((m) => (
          <li key={`${m.company_id}-${m.match_kind}`}>
            <strong>{m.company_name}</strong>
            {m.city ? ` (${m.city})` : ''} — {MATCH_LABELS[m.match_kind]}
            {m.mine ? ' · dans vos prospects' : m.has_open_lead ? ' · déjà suivi' : ''}
          </li>
        ))}
      </ul>
      {blocking && (
        <p className="mt-1.5 text-xs text-anthracite-500">
          {isAdmin
            ? 'En tant qu’administrateur, vous pouvez forcer la création (sauf SIREN identique).'
            : 'Création impossible : contactez l’administrateur si nécessaire.'}
        </p>
      )}
    </div>
  );
}
