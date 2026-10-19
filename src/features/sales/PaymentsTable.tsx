import { useState } from 'react';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import { useAuth } from '@/features/auth/AuthProvider';
import { formatEuros } from '@/lib/money';
import { PAYMENT_KIND_LABELS, PAYMENT_STATUS_LABELS, formatDate, formatMonth, todayInput } from '@/lib/sales';
import { humanizeError } from '@/lib/supabase';
import type { PaymentOverview } from '@/types/database';
import { Alert, Button, Field, Input, Modal, Select } from '@/components/ui';
import { useSetPaymentStatus } from './api';

const METHODS = ['Virement', 'Prélèvement', 'Carte bancaire', 'Chèque', 'Espèces', 'Stripe'];

export function EncashModal({ payment, onClose }: { payment: PaymentOverview | null; onClose: () => void }) {
  const setStatus = useSetPaymentStatus();
  const [date, setDate] = useState(todayInput());
  const [method, setMethod] = useState('Virement');
  const [reference, setReference] = useState('');

  return (
    <Modal
      open={payment !== null}
      onClose={setStatus.isPending ? () => undefined : () => { setStatus.reset(); onClose(); }}
      title="Enregistrer un encaissement"
      description={payment ? `${payment.company_name} · ${PAYMENT_KIND_LABELS[payment.kind]} · ${formatEuros(payment.amount_cents)}` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={setStatus.isPending}>Annuler</Button>
          <Button
            loading={setStatus.isPending}
            onClick={() =>
              payment &&
              setStatus.mutate(
                { id: payment.id, status: 'encaisse', paidAt: date, method, reference: reference.trim() || null },
                { onSuccess: () => { setReference(''); onClose(); } },
              )
            }
          >
            Confirmer l’encaissement
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date d’encaissement">{(id) => <Input id={id} type="date" value={date} max={todayInput()} onChange={(e) => setDate(e.target.value)} />}</Field>
          <Field label="Mode">
            {(id) => (
              <Select id={id} value={method} onChange={(e) => setMethod(e.target.value)}>
                {METHODS.map((m) => <option key={m}>{m}</option>)}
              </Select>
            )}
          </Field>
        </div>
        <Field label="Référence (facultatif)" hint="N° de virement, de transaction…">
          {(id) => <Input id={id} value={reference} onChange={(e) => setReference(e.target.value)} />}
        </Field>
        <p className="text-xs text-anthracite-500">Les commissions liées sont mises à jour automatiquement.</p>
        {setStatus.isError && <Alert>{humanizeError(setStatus.error)}</Alert>}
      </div>
    </Modal>
  );
}

export function PaymentsTable({ payments, showCompany }: { payments: PaymentOverview[]; showCompany?: boolean }) {
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const [encash, setEncash] = useState<PaymentOverview | null>(null);
  const setStatus = useSetPaymentStatus();
  const today = todayInput();

  if (payments.length === 0) return <p className="px-4 py-6 text-sm text-anthracite-500">Aucun paiement.</p>;

  return (
    <>
      {setStatus.isError && <div className="px-4 pt-3"><Alert>{humanizeError(setStatus.error)}</Alert></div>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-beige text-xs text-anthracite-500">
            <tr>
              {showCompany && <th className="px-4 py-2 text-left font-medium">Client</th>}
              <th className="px-4 py-2 text-left font-medium">Objet</th>
              <th className="px-4 py-2 text-left font-medium">Échéance</th>
              <th className="px-4 py-2 text-right font-medium">Montant</th>
              <th className="px-4 py-2 text-left font-medium">Statut</th>
              {isAdmin && <th className="px-4 py-2" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-beige">
            {payments.map((p) => {
              const late = p.status === 'en_attente' && p.due_on < today;
              return (
                <tr key={p.id}>
                  {showCompany && (
                    <td className="px-4 py-2.5">
                      <Link to={`/clients/${p.contract_id}`} className="font-medium hover:text-terracotta-700">{p.company_name}</Link>
                      <p className="text-xs text-anthracite-500">{p.contract_reference}</p>
                    </td>
                  )}
                  <td className="px-4 py-2.5">
                    {PAYMENT_KIND_LABELS[p.kind]}
                    {p.period_month && <span className="text-anthracite-500"> · {formatMonth(p.period_month)}</span>}
                  </td>
                  <td className={clsx('px-4 py-2.5', late && 'font-medium text-red-700')}>{formatDate(p.due_on)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatEuros(p.amount_cents)}</td>
                  <td className="px-4 py-2.5">
                    <span className={clsx('text-xs font-medium',
                      p.status === 'encaisse' ? 'text-emerald-700' : late ? 'text-red-700' : p.status === 'en_attente' ? 'text-amber-700' : 'text-anthracite-500')}>
                      {late ? 'En retard' : PAYMENT_STATUS_LABELS[p.status]}
                    </span>
                    {p.paid_at && <p className="text-xs text-anthracite-500">le {formatDate(p.paid_at)}{p.method ? ` · ${p.method}` : ''}</p>}
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-2.5 text-right">
                      {p.status === 'en_attente' ? (
                        <Button size="sm" variant="secondary" onClick={() => setEncash(p)}>Encaisser</Button>
                      ) : p.status === 'encaisse' ? (
                        <Button size="sm" variant="ghost" loading={setStatus.isPending && setStatus.variables?.id === p.id}
                          onClick={() => setStatus.mutate({ id: p.id, status: 'rembourse' })}>
                          Rembourser
                        </Button>
                      ) : null}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {isAdmin && <EncashModal payment={encash} onClose={() => setEncash(null)} />}
    </>
  );
}
