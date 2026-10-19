import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Coins, Download } from 'lucide-react';
import { useAuth } from '@/features/auth/AuthProvider';
import { download, toExcelCsv } from '@/features/import/lib';
import { normalizeSearch } from '@/lib/crm';
import { formatEuros } from '@/lib/money';
import {
  COMMISSION_STATUSES, COMMISSION_STATUS_LABELS, COMMISSION_STATUS_TONE, OFFER_LABELS, formatDate, formatMonth,
} from '@/lib/sales';
import { humanizeError } from '@/lib/supabase';
import type { CommissionStatus, CommissionTrigger, OfferCode } from '@/types/database';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, Spinner, Textarea } from '@/components/ui';
import { useCommissions, useMyCommissions, useUpdateCommissions } from './api';

type Line = {
  id: string; beneficiary_id: string | null; beneficiary_name: string | null; company_name: string;
  contract_id: string | null; contract_reference: string | null; offer_code: OfferCode; tranche: number;
  amount_cents: number; status: CommissionStatus; signed_at: string; acquired_at: string | null; paid_at: string | null;
  trigger_kind: CommissionTrigger; required_payments: number | null; payout_ref: string | null; invoice_ref: string | null;
};

type Action = { status: 'facturee' | 'payee' | 'annulee'; ids: string[] } | null;

const ACTIONABLE: Record<'facturee' | 'payee' | 'annulee', CommissionStatus[]> = {
  facturee: ['acquise'],
  payee: ['acquise', 'facturee'],
  annulee: ['previsionnelle', 'acquise', 'facturee'],
};

function ActionModal({ action, total, onClose, onDone }: { action: Action; total: number; onClose: () => void; onDone: () => void }) {
  const update = useUpdateCommissions();
  const [ref, setRef] = useState('');
  const [reason, setReason] = useState('');
  if (!action) return null;
  const needsRef = action.status === 'payee';
  const label = { facturee: 'Marquer comme facturées', payee: 'Marquer comme payées', annulee: 'Annuler les commissions' }[action.status];
  const valid = action.status === 'annulee' ? !!reason.trim() : needsRef ? !!ref.trim() : true;

  return (
    <Modal
      open
      onClose={update.isPending ? () => undefined : onClose}
      title={label}
      description={`${action.ids.length} commission${action.ids.length > 1 ? 's' : ''} · ${formatEuros(total)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={update.isPending}>Retour</Button>
          <Button
            variant={action.status === 'annulee' ? 'danger' : 'primary'}
            loading={update.isPending}
            disabled={!valid}
            onClick={() => update.mutate(
              { ids: action.ids, status: action.status, reference: ref.trim() || undefined, reason: reason.trim() || undefined },
              { onSuccess: onDone },
            )}
          >
            Confirmer
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        {action.status === 'annulee' ? (
          <Field label="Motif d’annulation">{(id) => <Textarea id={id} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
        ) : (
          <Field
            label={needsRef ? 'Référence du virement (obligatoire)' : 'N° de facture du bénéficiaire (facultatif)'}
            hint={needsRef ? 'Une commission payée ne peut plus être modifiée ni payée une seconde fois.' : undefined}
          >
            {(id) => <Input id={id} value={ref} onChange={(e) => setRef(e.target.value)} />}
          </Field>
        )}
        {update.isError && <Alert>{humanizeError(update.error)}</Alert>}
      </div>
    </Modal>
  );
}

export function CommissionsPage() {
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const isReferrer = role === 'apporteur';
  const all = useCommissions(undefined, !isReferrer);
  const mine = useMyCommissions(isReferrer);
  const query = isReferrer ? mine : all;

  const [status, setStatus] = useState<CommissionStatus | ''>('');
  const [beneficiary, setBeneficiary] = useState('');
  const [month, setMonth] = useState('');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [action, setAction] = useState<Action>(null);

  const lines: Line[] = useMemo(() => {
    if (isReferrer) {
      return (mine.data ?? []).map((m) => ({
        ...m, beneficiary_id: null, beneficiary_name: null, contract_id: null, contract_reference: null, payout_ref: null, invoice_ref: null,
      }));
    }
    return (all.data ?? []).map((c) => ({ ...c }));
  }, [isReferrer, mine.data, all.data]);

  const beneficiaries = useMemo(
    () => [...new Map(lines.filter((l) => l.beneficiary_id).map((l) => [l.beneficiary_id!, l.beneficiary_name ?? '—'])).entries()],
    [lines],
  );
  const months = useMemo(() => [...new Set(lines.map((l) => l.signed_at.slice(0, 7)))].sort().reverse(), [lines]);

  const filtered = useMemo(() => {
    const n = normalizeSearch(q);
    return lines.filter((l) =>
      (!status || l.status === status) &&
      (!beneficiary || l.beneficiary_id === beneficiary) &&
      (!month || l.signed_at.startsWith(month)) &&
      (!n || normalizeSearch(`${l.company_name} ${l.contract_reference ?? ''}`).includes(n)));
  }, [lines, status, beneficiary, month, q]);

  const sum = (s: CommissionStatus[]) => filtered.filter((l) => s.includes(l.status)).reduce((t, l) => t + Number(l.amount_cents), 0);
  const totals = { forecast: sum(['previsionnelle']), due: sum(['acquise', 'facturee']), paid: sum(['payee']) };

  const byBeneficiary = useMemo(() => {
    const map = new Map<string, { name: string; forecast: number; due: number; paid: number }>();
    filtered.forEach((l) => {
      const key = l.beneficiary_id ?? '-';
      const e = map.get(key) ?? { name: l.beneficiary_name ?? '—', forecast: 0, due: 0, paid: 0 };
      const a = Number(l.amount_cents);
      if (l.status === 'previsionnelle') e.forecast += a;
      else if (l.status === 'acquise' || l.status === 'facturee') e.due += a;
      else if (l.status === 'payee') e.paid += a;
      map.set(key, e);
    });
    return [...map.values()].sort((a, b) => b.due - a.due);
  }, [filtered]);

  const selectedLines = filtered.filter((l) => selected.has(l.id));
  const selectedTotal = selectedLines.reduce((t, l) => t + Number(l.amount_cents), 0);
  const canDo = (s: 'facturee' | 'payee' | 'annulee') =>
    selectedLines.length > 0 && selectedLines.every((l) => ACTIONABLE[s].includes(l.status));
  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const exportCsv = () => {
    const rows = filtered.map((l) => [
      l.beneficiary_name ?? '', l.company_name, l.contract_reference ?? '', OFFER_LABELS[l.offer_code], l.tranche,
      (Number(l.amount_cents) / 100).toFixed(2).replace('.', ','), COMMISSION_STATUS_LABELS[l.status],
      l.signed_at, l.acquired_at?.slice(0, 10) ?? '', l.paid_at?.slice(0, 10) ?? '', l.payout_ref ?? '',
    ]);
    download(`commissions-${new Date().toISOString().slice(0, 10)}.csv`, toExcelCsv([
      ['Bénéficiaire', 'Client', 'Contrat', 'Offre', 'Tranche', 'Montant (€)', 'Statut', 'Signature', 'Acquise le', 'Payée le', 'Réf. virement'],
      ...rows,
    ]));
  };

  return (
    <>
      <PageHeader
        title={isAdmin ? 'Commissions' : 'Mes commissions'}
        description={isAdmin ? 'Suivi, facturation et paiement des commissions.' : 'Vos commissions et leur avancement.'}
        actions={<Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={exportCsv} disabled={!filtered.length}>Export Excel</Button>}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card className="px-4 py-3">
          <p className="text-xs text-anthracite-500">Prévisionnel</p>
          <p className="mt-1 font-display text-xl font-semibold tabular-nums">{formatEuros(totals.forecast)}</p>
          <p className="text-xs text-anthracite-300">En attente d’encaissement client</p>
        </Card>
        <Card className="px-4 py-3">
          <p className="text-xs text-anthracite-500">{isAdmin ? 'Dû (acquis, non payé)' : 'Acquis, à recevoir'}</p>
          <p className="mt-1 font-display text-xl font-semibold tabular-nums text-terracotta-700">{formatEuros(totals.due)}</p>
        </Card>
        <Card className="px-4 py-3">
          <p className="text-xs text-anthracite-500">Payé</p>
          <p className="mt-1 font-display text-xl font-semibold tabular-nums">{formatEuros(totals.paid)}</p>
        </Card>
      </div>

      {isAdmin && byBeneficiary.length > 1 && (
        <Card className="mb-4">
          <h2 className="px-4 pb-1 pt-4 text-sm font-semibold">Par bénéficiaire</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-anthracite-500">
                <tr>
                  <th className="px-4 py-1.5 text-left font-medium">Bénéficiaire</th>
                  <th className="px-4 py-1.5 text-right font-medium">Prévisionnel</th>
                  <th className="px-4 py-1.5 text-right font-medium">Dû</th>
                  <th className="px-4 py-1.5 text-right font-medium">Payé</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-beige">
                {byBeneficiary.map((b) => (
                  <tr key={b.name}>
                    <td className="px-4 py-2">{b.name}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-anthracite-500">{formatEuros(b.forecast)}</td>
                    <td className="px-4 py-2 text-right font-medium tabular-nums">{formatEuros(b.due)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatEuros(b.paid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="mb-3 grid grid-cols-2 gap-2 lg:flex">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Client ou contrat…" className="col-span-2 lg:flex-1" aria-label="Rechercher" />
        <Select value={status} onChange={(e) => setStatus(e.target.value as CommissionStatus | '')} className="lg:!w-44" aria-label="Statut">
          <option value="">Tous les statuts</option>
          {COMMISSION_STATUSES.map((s) => <option key={s} value={s}>{COMMISSION_STATUS_LABELS[s]}</option>)}
        </Select>
        <Select value={month} onChange={(e) => setMonth(e.target.value)} className="lg:!w-48" aria-label="Mois de signature">
          <option value="">Tous les mois</option>
          {months.map((m) => <option key={m} value={m}>{formatMonth(`${m}-01`)}</option>)}
        </Select>
        {isAdmin && (
          <Select value={beneficiary} onChange={(e) => setBeneficiary(e.target.value)} className="col-span-2 lg:!w-48" aria-label="Bénéficiaire">
            <option value="">Tous les bénéficiaires</option>
            {beneficiaries.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </Select>
        )}
      </div>

      {isAdmin && selectedLines.length > 0 && (
        <Card className="sticky top-2 z-10 mb-3 flex flex-wrap items-center gap-2 border-terracotta/40 px-4 py-2.5">
          <p className="mr-auto text-sm"><strong>{selectedLines.length}</strong> sélectionnée{selectedLines.length > 1 ? 's' : ''} · {formatEuros(selectedTotal)}</p>
          <Button size="sm" variant="secondary" disabled={!canDo('facturee')} onClick={() => setAction({ status: 'facturee', ids: [...selected] })}>Facturées</Button>
          <Button size="sm" disabled={!canDo('payee')} onClick={() => setAction({ status: 'payee', ids: [...selected] })}>Payées</Button>
          <Button size="sm" variant="ghost" disabled={!canDo('annulee')} onClick={() => setAction({ status: 'annulee', ids: [...selected] })}>Annuler</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Désélectionner</Button>
        </Card>
      )}

      <Card>
        {query.isPending ? <Spinner /> : query.isError ? <div className="p-4"><Alert>{humanizeError(query.error)}</Alert></div> : filtered.length === 0 ? (
          <EmptyState icon={<Coins className="h-8 w-8" />} title={lines.length ? 'Aucun résultat' : 'Aucune commission pour l’instant'}>
            {lines.length ? 'Modifiez les filtres.' : 'Les commissions apparaissent à la signature des contrats.'}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-beige text-xs text-anthracite-500">
                <tr>
                  {isAdmin && <th className="w-10 px-4 py-2"><span className="sr-only">Sélection</span></th>}
                  {isAdmin && <th className="px-4 py-2 text-left font-medium">Bénéficiaire</th>}
                  <th className="px-4 py-2 text-left font-medium">Client</th>
                  <th className="hidden px-4 py-2 text-left font-medium md:table-cell">Condition</th>
                  <th className="px-4 py-2 text-right font-medium">Montant</th>
                  <th className="px-4 py-2 text-left font-medium">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-beige">
                {filtered.map((l) => (
                  <tr key={l.id} className={selected.has(l.id) ? 'bg-terracotta-50/50' : undefined}>
                    {isAdmin && (
                      <td className="px-4 py-2.5">
                        <input
                          type="checkbox"
                          className="accent-terracotta"
                          checked={selected.has(l.id)}
                          disabled={l.status === 'payee' || l.status === 'annulee'}
                          onChange={() => toggle(l.id)}
                          aria-label={`Sélectionner ${l.company_name} tranche ${l.tranche}`}
                        />
                      </td>
                    )}
                    {isAdmin && <td className="px-4 py-2.5">{l.beneficiary_name}</td>}
                    <td className="px-4 py-2.5">
                      {l.contract_id ? (
                        <Link to={`/clients/${l.contract_id}`} className="font-medium hover:text-terracotta-700">{l.company_name}</Link>
                      ) : <span className="font-medium">{l.company_name}</span>}
                      <p className="text-xs text-anthracite-500">
                        {OFFER_LABELS[l.offer_code]} · tranche {l.tranche} · signé le {formatDate(l.signed_at)}
                      </p>
                    </td>
                    <td className="hidden px-4 py-2.5 text-xs text-anthracite-500 md:table-cell">
                      {l.trigger_kind === 'premier_encaissement' ? '1ᵉʳ encaissement' : `${l.required_payments} mensualités`}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatEuros(l.amount_cents)}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={COMMISSION_STATUS_TONE[l.status]}>{COMMISSION_STATUS_LABELS[l.status]}</Badge>
                      {l.paid_at && <p className="mt-0.5 text-xs text-anthracite-500">le {formatDate(l.paid_at)}{l.payout_ref ? ` · ${l.payout_ref}` : ''}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ActionModal
        key={action ? `${action.status}-${action.ids.join()}` : 'none'}
        action={action}
        total={selectedTotal}
        onClose={() => setAction(null)}
        onDone={() => { setAction(null); setSelected(new Set()); }}
      />
    </>
  );
}
