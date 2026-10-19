import { useMemo, useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { formatEuros } from '@/lib/money';
import { formatMonth, monthInput, todayInput } from '@/lib/sales';
import { humanizeError } from '@/lib/supabase';
import { Alert, Button, Card, Input, PageHeader, Segmented, Spinner } from '@/components/ui';
import { useGenerateMonthly, usePayments } from './api';
import { PaymentsTable } from './PaymentsTable';

type View = 'a_encaisser' | 'encaisses' | 'tous';

export function PaymentsPage() {
  const payments = usePayments();
  const generate = useGenerateMonthly();
  const [month, setMonth] = useState(monthInput());
  const [view, setView] = useState<View>('a_encaisser');
  const [notice, setNotice] = useState<string | null>(null);
  const today = todayInput();

  const rows = useMemo(() => {
    const all = payments.data ?? [];
    if (view === 'a_encaisser') return all.filter((p) => p.status === 'en_attente');
    if (view === 'encaisses') return all.filter((p) => p.status === 'encaisse').reverse();
    return [...all].reverse();
  }, [payments.data, view]);

  const totals = useMemo(() => {
    const all = payments.data ?? [];
    const pending = all.filter((p) => p.status === 'en_attente');
    const thisMonth = today.slice(0, 7);
    return {
      pending: pending.reduce((s, p) => s + Number(p.amount_cents), 0),
      late: pending.filter((p) => p.due_on < today).reduce((s, p) => s + Number(p.amount_cents), 0),
      lateCount: pending.filter((p) => p.due_on < today).length,
      cashedMonth: all.filter((p) => p.status === 'encaisse' && (p.paid_at ?? '').slice(0, 7) === thisMonth)
        .reduce((s, p) => s + Number(p.amount_cents), 0),
    };
  }, [payments.data, today]);

  return (
    <>
      <PageHeader title="Paiements" description="Échéances à encaisser et encaissements enregistrés." />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card className="px-4 py-3">
          <p className="text-xs text-anthracite-500">À encaisser</p>
          <p className="mt-1 font-display text-xl font-semibold tabular-nums">{formatEuros(totals.pending)}</p>
        </Card>
        <Card className="px-4 py-3">
          <p className="text-xs text-anthracite-500">Dont en retard</p>
          <p className={`mt-1 font-display text-xl font-semibold tabular-nums ${totals.late ? 'text-red-700' : ''}`}>{formatEuros(totals.late)}</p>
          {totals.lateCount > 0 && <p className="text-xs text-anthracite-300">{totals.lateCount} échéance{totals.lateCount > 1 ? 's' : ''}</p>}
        </Card>
        <Card className="px-4 py-3">
          <p className="text-xs text-anthracite-500">Encaissé ce mois-ci</p>
          <p className="mt-1 font-display text-xl font-semibold tabular-nums">{formatEuros(totals.cashedMonth)}</p>
        </Card>
      </div>

      <Card className="mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <p className="text-sm font-semibold">Mensualités des abonnements</p>
          <p className="text-xs text-anthracite-500">
            Crée l’échéance du mois pour chaque abonnement actif. Sans risque de doublon : relancer ne recrée rien.
          </p>
        </div>
        <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="sm:!w-44" aria-label="Mois" />
        <Button
          icon={<CalendarPlus className="h-4 w-4" />}
          loading={generate.isPending}
          onClick={() => {
            setNotice(null);
            generate.mutate(month, {
              onSuccess: (n) => setNotice(n ? `${n} mensualité${n > 1 ? 's' : ''} créée${n > 1 ? 's' : ''} pour ${formatMonth(`${month}-01`)}.` : `Rien à créer pour ${formatMonth(`${month}-01`)} : tout est déjà à jour.`),
            });
          }}
        >
          Générer
        </Button>
      </Card>
      {notice && <div className="mb-4"><Alert tone="success">{notice}</Alert></div>}
      {generate.isError && <div className="mb-4"><Alert>{humanizeError(generate.error)}</Alert></div>}

      <div className="mb-3">
        <Segmented label="Filtre" value={view} onChange={setView} options={[
          { value: 'a_encaisser', label: 'À encaisser' }, { value: 'encaisses', label: 'Encaissés' }, { value: 'tous', label: 'Tous' },
        ]} />
      </div>
      <Card>
        {payments.isPending ? <Spinner /> : payments.isError ? <div className="p-4"><Alert>{humanizeError(payments.error)}</Alert></div> : (
          <PaymentsTable payments={rows} showCompany />
        )}
      </Card>
    </>
  );
}
