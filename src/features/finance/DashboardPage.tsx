import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { supabase, humanizeError } from '@/lib/supabase';
import { formatEuros, formatBps } from '@/lib/money';
import { formatDate, todayInput } from '@/lib/sales';
import type { DashboardKpis, MonthlyPoint } from '@/types/database';
import { Alert, Card, Input, PageHeader, Segmented, Spinner } from '@/components/ui';
import { ProjectsToHandle } from '@/features/projects/ProjectsToHandle';
import { MonthlyBars, MonthlyLine, CHART } from './charts';

type Preset = 'jour' | 'semaine' | 'mois' | 'annee' | 'perso';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function periodFor(preset: Exclude<Preset, 'perso'>, now = new Date()): { from: string; to: string } {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === 'jour') return { from: iso(d), to: iso(d) };
  if (preset === 'semaine') {
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return { from: iso(monday), to: iso(d) };
  }
  if (preset === 'mois') return { from: iso(new Date(d.getFullYear(), d.getMonth(), 1)), to: iso(d) };
  return { from: iso(new Date(d.getFullYear(), 0, 1)), to: iso(d) };
}

function Kpi({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'accent' | 'danger' }) {
  return (
    <Card className="px-4 py-3">
      <p className="text-xs text-anthracite-500">{label}</p>
      <p className={`mt-1 font-display text-xl font-semibold tabular-nums ${tone === 'accent' ? 'text-terracotta-700' : tone === 'danger' ? 'text-red-700' : ''}`}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-anthracite-300">{hint}</p>}
    </Card>
  );
}

function Section({ title, children, note }: { title: string; children: ReactNode; note?: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {note && <p className="text-xs text-anthracite-500">{note}</p>}
      </div>
      {children}
    </section>
  );
}

export function DashboardPage() {
  const [preset, setPreset] = useState<Preset>('mois');
  const [custom, setCustom] = useState({ from: periodFor('mois').from, to: todayInput() });
  const period = preset === 'perso' ? custom : periodFor(preset);
  const validCustom = preset !== 'perso' || (custom.from && custom.to && custom.from <= custom.to);

  const kpis = useQuery({
    queryKey: ['dashboard', period.from, period.to],
    enabled: !!validCustom,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('dashboard_kpis', { p_from: period.from, p_to: period.to });
      if (error) throw error;
      return data as DashboardKpis;
    },
  });
  const monthly = useQuery({
    queryKey: ['dashboard-monthly'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('dashboard_monthly', { p_end: todayInput(), p_months: 12 });
      if (error) throw error;
      return (data ?? []) as MonthlyPoint[];
    },
  });

  const series = useMemo(() => (monthly.data ?? []).map((m) => ({
    month: String(m.month).slice(0, 10),
    cash: Number(m.cash_in_cents), mrr: Number(m.mrr_cents), signed: m.contracts_signed,
  })), [monthly.data]);

  const k = kpis.data;
  const charges = k ? Number(k.commissions_paid_cents) + Number(k.fixed_costs_cents) + Number(k.variable_costs_cents)
    + Number(k.expenses_cents) + Number(k.contributions_provision_cents) : 0;

  return (
    <>
      <PageHeader
        title="Tableau de bord"
        description={`Du ${formatDate(period.from)} au ${formatDate(period.to)}`}
      />
      <ProjectsToHandle limit={4} />

      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="overflow-x-auto">
          <Segmented label="Période" value={preset} onChange={setPreset} options={[
            { value: 'jour', label: 'Aujourd’hui' }, { value: 'semaine', label: 'Semaine' }, { value: 'mois', label: 'Mois' },
            { value: 'annee', label: 'Année' }, { value: 'perso', label: 'Personnalisée' },
          ]} />
        </div>
        {preset === 'perso' && (
          <div className="flex items-center gap-2">
            <Input type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className="!w-40" aria-label="Du" />
            <span className="text-sm text-anthracite-500">au</span>
            <Input type="date" value={custom.to} min={custom.from} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className="!w-40" aria-label="Au" />
          </div>
        )}
      </div>

      {kpis.isError && <div className="mb-4"><Alert>{humanizeError(kpis.error)}</Alert></div>}
      {!k ? (kpis.isFetching || kpis.isPending ? <Spinner /> : null) : (
        <div className="space-y-8">
          <Section title="Activité commerciale">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <Kpi label="Nouveaux prospects" value={k.leads_created} />
              <Kpi label="Prospects qualifiés" value={k.leads_qualified} hint="passés à « intéressé » ou plus" />
              <Kpi label="Rendez-vous obtenus" value={k.meetings} />
              <Kpi label="Propositions envoyées" value={k.proposals} />
              <Kpi label="Contrats signés" value={k.contracts_signed} tone="accent" />
              <Kpi label="Taux de transformation" value={k.conversion_rate_bps === null ? '—' : formatBps(Number(k.conversion_rate_bps))}
                hint={`${k.won} gagné${k.won > 1 ? 's' : ''} / ${k.won + k.lost} clos`} />
            </div>
            {k.sales_by_owner.length > 0 && (
              <Card>
                <table className="w-full text-sm">
                  <thead className="text-xs text-anthracite-500">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">Ventes par commercial</th>
                      <th className="px-4 py-2 text-right font-medium">Contrats</th>
                      <th className="px-4 py-2 text-right font-medium">Valeur contractuelle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-beige">
                    {k.sales_by_owner.map((s) => (
                      <tr key={s.name}>
                        <td className="px-4 py-2">{s.name}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{s.contracts}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatEuros(s.value_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </Section>

          <Section title="Chiffre d’affaires et abonnements" note="CA encaissé, CA signé et MRR sont trois mesures distinctes : elles ne s’additionnent pas.">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Kpi label="CA encaissé" value={formatEuros(k.cash_in_cents)} hint="paiements reçus sur la période" tone="accent" />
              <Kpi label="CA signé non encaissé" value={formatEuros(k.signed_unpaid_cents)} hint="reste dû sur les contrats en cours" />
              <Kpi label="MRR" value={formatEuros(k.mrr_cents)} hint={`au ${formatDate(period.to)}`} />
              <Kpi label="ARR" value={formatEuros(k.arr_cents)} hint="MRR × 12" />
              <Kpi label="Abonnements actifs" value={k.active_subscriptions} />
              <Kpi label="Nouvelles souscriptions" value={k.new_subscriptions} />
              <Kpi label="Résiliations" value={k.cancellations} />
              <Kpi label="Impayés en retard" value={formatEuros(k.overdue_cents)} tone={Number(k.overdue_cents) > 0 ? 'danger' : undefined} />
            </div>
          </Section>

          <Section title="Commissions et charges">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Kpi label="Commissions dues" value={formatEuros(k.commissions_due_cents)} hint="acquises, non payées" />
              <Kpi label="Commissions payées" value={formatEuros(k.commissions_paid_cents)} hint="sur la période" />
              <Kpi label="Frais fixes (estimés)" value={formatEuros(k.fixed_costs_cents)} hint="hypothèse au prorata de la période" />
              <Kpi label="Coûts variables (estimés)" value={formatEuros(k.variable_costs_cents)} hint={`${k.active_subscriptions} abonnement(s)`} />
            </div>
            <Card className="p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold">Trésorerie estimée après charges</p>
                  <p className="mt-0.5 text-xs text-anthracite-500">
                    {formatEuros(k.cash_in_cents)} encaissés − {formatEuros(charges)} de charges
                    (commissions payées, frais fixes, coûts variables{Number(k.expenses_cents) > 0 ? ', dépenses' : ''}, provision de cotisations {formatEuros(k.contributions_provision_cents)})
                  </p>
                </div>
                <p className={`font-display text-2xl font-semibold tabular-nums ${Number(k.estimated_cash_cents) < 0 ? 'text-red-700' : ''}`}>
                  {formatEuros(k.estimated_cash_cents)}
                </p>
              </div>
              <p className="mt-3 flex items-start gap-1.5 text-xs text-anthracite-500">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                Estimation de gestion. La provision de cotisations n’est pas un calcul fiscal ou social définitif.
              </p>
            </Card>
          </Section>
        </div>
      )}

      <section className="mt-8 space-y-3">
        <h2 className="text-sm font-semibold">12 derniers mois</h2>
        {monthly.isPending ? <Spinner /> : monthly.isError ? <Alert>{humanizeError(monthly.error)}</Alert> : (
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="p-4">
              <p className="text-xs font-medium text-anthracite-500">CA encaissé par mois</p>
              <MonthlyBars data={series} dataKey="cash" name="CA encaissé" />
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium text-anthracite-500">MRR en fin de mois</p>
              <MonthlyLine data={series} series={[{ key: 'mrr', name: 'MRR', color: CHART.primary }]} />
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium text-anthracite-500">Contrats signés par mois</p>
              <MonthlyBars data={series} dataKey="signed" name="Contrats signés" money={false} />
            </Card>
          </div>
        )}
        {series.length > 0 && (
          <details className="text-xs text-anthracite-500">
            <summary className="cursor-pointer">Voir les données en tableau</summary>
            <table className="mt-2 w-full max-w-xl text-sm">
              <thead><tr className="text-left text-xs"><th className="py-1">Mois</th><th className="py-1 text-right">CA encaissé</th><th className="py-1 text-right">MRR</th><th className="py-1 text-right">Contrats</th></tr></thead>
              <tbody>
                {series.map((s) => (
                  <tr key={s.month} className="border-t border-beige">
                    <td className="py-1">{formatDate(s.month).replace(/^1 /, '')}</td>
                    <td className="py-1 text-right tabular-nums">{formatEuros(s.cash)}</td>
                    <td className="py-1 text-right tabular-nums">{formatEuros(s.mrr)}</td>
                    <td className="py-1 text-right tabular-nums">{s.signed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </section>
    </>
  );
}
