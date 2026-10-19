import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { FlaskConical, RotateCcw } from 'lucide-react';
import { supabase, humanizeError } from '@/lib/supabase';
import { centsToInput, formatEuros, parseEuros } from '@/lib/money';
import { todayInput } from '@/lib/sales';
import type { MonthlyPoint, ScenarioRow } from '@/types/database';
import { Alert, Button, Card, Field, Input, PageHeader, Spinner } from '@/components/ui';
import { COMMISSION_DEFAULTS, byYear, runForecast, type Assumptions } from './forecast';
import { CHART, MonthlyLine } from './charts';

const ORDER = ['prudent', 'central', 'ambitieux'] as const;
const LABELS: Record<string, string> = { prudent: 'Prudent', central: 'Central', ambitieux: 'Ambitieux' };

// Champs éditables : unité d'affichage → stockage (centimes, bps, nombre)
type Unit = 'eur' | 'pct' | 'num';
const FIELDS: { key: keyof Assumptions; label: string; unit: Unit; group: string }[] = [
  { key: 'new_subscriptions_per_month', label: 'Nouveaux abonnements / mois', unit: 'num', group: 'Ventes' },
  { key: 'direct_sales_per_month', label: 'Ventes directes / mois', unit: 'num', group: 'Ventes' },
  { key: 'renewal_rate_bps', label: 'Taux de renouvellement (%)', unit: 'pct', group: 'Ventes' },
  { key: 'planning_attach_rate_bps', label: 'Clients avec option planning (%)', unit: 'pct', group: 'Ventes' },
  { key: 'referral_share_bps', label: 'Ventes via apporteurs (%)', unit: 'pct', group: 'Ventes' },
  { key: 'subscription_price_cents', label: 'Prix abonnement (€/mois)', unit: 'eur', group: 'Prix' },
  { key: 'setup_fee_cents', label: 'Mise en service (€)', unit: 'eur', group: 'Prix' },
  { key: 'direct_sale_price_cents', label: 'Vente directe (€)', unit: 'eur', group: 'Prix' },
  { key: 'planning_price_cents', label: 'Option planning (€/mois)', unit: 'eur', group: 'Prix' },
  { key: 'commercial_sub_commission_cents', label: 'Commission commerciale abonnement (€)', unit: 'eur', group: 'Commissions' },
  { key: 'commercial_direct_commission_cents', label: 'Commission commerciale vente directe (€)', unit: 'eur', group: 'Commissions' },
  { key: 'referrer_sub_commission_cents', label: 'Commission apporteur abonnement (€)', unit: 'eur', group: 'Commissions' },
  { key: 'referrer_direct_commission_cents', label: 'Commission apporteur vente directe (€)', unit: 'eur', group: 'Commissions' },
  { key: 'variable_cost_per_sub_cents', label: 'Coût variable (€/client/mois)', unit: 'eur', group: 'Coûts' },
  { key: 'fixed_costs_monthly_cents', label: 'Frais fixes (€/mois)', unit: 'eur', group: 'Coûts' },
  { key: 'salary_costs_monthly_cents', label: 'Coûts salariaux (€/mois)', unit: 'eur', group: 'Coûts' },
  { key: 'contributions_provision_bps', label: 'Provision cotisations (% du CA)', unit: 'pct', group: 'Coûts' },
];

function toInput(v: number | undefined, unit: Unit) {
  if (v === undefined || v === null) return '';
  if (unit === 'eur') return centsToInput(v);
  if (unit === 'pct') return String(v / 100).replace('.', ',');
  return String(v).replace('.', ',');
}
function fromInput(s: string, unit: Unit): number | null {
  if (unit === 'eur') return parseEuros(s);
  const n = Number(s.replace(',', '.').replace(/\s/g, ''));
  if (!Number.isFinite(n) || n < 0) return null;
  if (unit === 'pct') return n > 100 ? null : Math.round(n * 100);
  return n > 10000 ? null : n;
}

function withDefaults(a: Record<string, number>): Assumptions {
  return { ...COMMISSION_DEFAULTS, ...a } as Assumptions;
}

export function ForecastPage() {
  const qc = useQueryClient();
  const scenarios = useQuery({
    queryKey: ['scenarios'],
    queryFn: async () => {
      const { data, error } = await supabase.from('financial_scenarios').select('*').eq('is_reference', true);
      if (error) throw error;
      return (data as ScenarioRow[]).sort((a, b) => ORDER.indexOf(a.kind as never) - ORDER.indexOf(b.kind as never));
    },
  });
  const real = useQuery({
    queryKey: ['dashboard-monthly'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('dashboard_monthly', { p_end: todayInput(), p_months: 12 });
      if (error) throw error;
      return (data ?? []) as MonthlyPoint[];
    },
  });

  const [selected, setSelected] = useState<string>('central');
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  const [opening, setOpening] = useState('0');
  const current = scenarios.data?.find((s) => s.kind === selected);

  useEffect(() => {
    if (!scenarios.data) return;
    setDrafts(Object.fromEntries(scenarios.data.map((s) => {
      const a = withDefaults(s.assumptions);
      return [s.kind, Object.fromEntries(FIELDS.map((f) => [f.key, toInput(a[f.key] as number, f.unit)]))];
    })));
  }, [scenarios.data]);

  // Hypothèses effectives (brouillon si valide, sinon valeur enregistrée)
  const effective = useMemo(() => {
    const out: Record<string, { a: Assumptions; invalid: string[] }> = {};
    scenarios.data?.forEach((s) => {
      const base = withDefaults(s.assumptions);
      const d = drafts[s.kind] ?? {};
      const invalid: string[] = [];
      const a = { ...base } as Record<string, number>;
      FIELDS.forEach((f) => {
        const raw = d[f.key];
        if (raw === undefined) return;
        const v = fromInput(raw, f.unit);
        if (v === null) invalid.push(f.key); else a[f.key] = v;
      });
      out[s.kind] = { a: a as unknown as Assumptions, invalid };
    });
    return out;
  }, [scenarios.data, drafts]);

  const now = new Date();
  const startYear = now.getFullYear();
  const startMonth = now.getMonth() + 1;
  const openingCents = parseEuros(opening.replace('-', '')) ?? 0;

  const [useOpening, setUseOpening] = useState(true);
  const lastReal = real.data?.at(-1);
  const portfolio = useOpening && lastReal && Number(lastReal.active_subscriptions) > 0
    ? { subscriptions: Number(lastReal.active_subscriptions), mrrCents: Number(lastReal.mrr_cents) }
    : undefined;

  const results = useMemo(() => Object.fromEntries(Object.entries(effective).map(([k, v]) =>
    [k, runForecast(v.a, startYear, startMonth, openingCents, portfolio)])),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [effective, startYear, startMonth, openingCents, portfolio?.subscriptions, portfolio?.mrrCents]);
  const years = results[selected] ? byYear(results[selected]!) : [];

  const save = useMutation({
    mutationFn: async () => {
      if (!current) return;
      const a = effective[selected]!.a;
      const payload = Object.fromEntries(FIELDS.map((f) => [f.key, a[f.key] as number]));
      const { error } = await supabase.rpc('save_scenario', { p_id: current.id, p_assumptions: payload });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['scenarios'] }),
  });

  const dirty = useMemo(() => {
    if (!current || !drafts[selected]) return false;
    const base = withDefaults(current.assumptions);
    return FIELDS.some((f) => drafts[selected]![f.key] !== toInput(base[f.key] as number, f.unit));
  }, [current, drafts, selected]);

  // Graphique MRR : réel (trait plein) puis prévision (pointillés), raccordés au mois en cours
  const mrrChart = useMemo(() => {
    const rows = new Map<string, { month: string; real: number | null; forecast: number | null }>();
    (real.data ?? []).forEach((m) => {
      const key = String(m.month).slice(0, 7);
      rows.set(key, { month: `${key}-01`, real: Number(m.mrr_cents), forecast: null });
    });
    results[selected]?.forEach((m) => {
      const key = `${m.year}-${String(m.month).padStart(2, '0')}`;
      const row = rows.get(key) ?? { month: `${key}-01`, real: null, forecast: null };
      row.forecast = m.mrr;
      rows.set(key, row);
    });
    return [...rows.values()].sort((a, b) => a.month.localeCompare(b.month));
  }, [real.data, results, selected]);

  const cashChart = useMemo(() => {
    const base = results[ORDER[1]] ?? results[selected] ?? [];
    return base.map((m, i) => {
      const row: Record<string, number | string> = { month: `${m.year}-${String(m.month).padStart(2, '0')}-01` };
      ORDER.forEach((k) => { const r = results[k]?.[i]; if (r) row[k] = Math.round(r.cumulativeCash); });
      return row;
    });
  }, [results, selected]);

  if (scenarios.isPending) return <Spinner />;
  if (scenarios.isError) return <Alert>{humanizeError(scenarios.error)}</Alert>;

  const rowsDef: { label: string; get: (y: (typeof years)[number]) => number; strong?: boolean; sub?: boolean; negative?: boolean }[] = [
    { label: 'Chiffre d’affaires', get: (y) => y.revenue, strong: true },
    { label: 'dont abonnements', get: (y) => y.revenueSubscriptions, sub: true },
    { label: 'dont mises en service', get: (y) => y.revenueSetup, sub: true },
    { label: 'dont ventes directes', get: (y) => y.revenueDirect, sub: true },
    { label: 'Commissions', get: (y) => y.commissions, negative: true },
    { label: 'Coûts variables', get: (y) => y.variableCosts, negative: true },
    { label: 'Frais fixes', get: (y) => y.fixedCosts, negative: true },
    { label: 'Coûts salariaux', get: (y) => y.salaries, negative: true },
    { label: 'Provision de cotisations', get: (y) => y.provision, negative: true },
    { label: 'Trésorerie générée', get: (y) => y.net, strong: true },
    { label: 'Trésorerie cumulée (fin d’année)', get: (y) => y.cumulativeCashEnd },
    { label: 'MRR (fin d’année)', get: (y) => y.mrrEnd },
    { label: 'ARR (fin d’année)', get: (y) => y.arrEnd },
  ];

  const groups = [...new Set(FIELDS.map((f) => f.group))];
  const invalid = effective[selected]?.invalid ?? [];

  return (
    <>
      <PageHeader title="Finances & prévisionnel" description={`Projection de ${String(startMonth).padStart(2, '0')}/${startYear} à décembre ${startYear + 2}`} />

      <div className="mb-4 flex items-start gap-2 rounded-lg border border-dashed border-terracotta/50 bg-terracotta-50/60 px-3 py-2.5 text-sm text-terracotta-700">
        <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p><strong>Prévision</strong> : calcul à partir d’hypothèses, pas des données réelles. Le réel est sur le tableau de bord et, ici, en trait plein sur le graphique du MRR.</p>
      </div>

      <div role="tablist" aria-label="Scénario" className="mb-4 flex flex-wrap gap-2">
        {ORDER.map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={selected === k}
            onClick={() => setSelected(k)}
            className={clsx('inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm',
              selected === k ? 'border-anthracite bg-anthracite text-white' : 'border-beige-300 bg-white hover:bg-creme')}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART.scenario[k] }} aria-hidden />
            {LABELS[k]}
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-beige text-xs text-anthracite-500">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Scénario {LABELS[selected]?.toLowerCase()}</th>
                  {years.map((y, i) => (
                    <th key={y.year} className="px-4 py-2 text-right font-medium">
                      {i === 0 ? 'N' : `N+${i}`} · {y.year}{y.months < 12 ? ` (${y.months} mois)` : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-beige">
                {rowsDef.map((r) => (
                  <tr key={r.label} className={r.strong ? 'bg-creme/50' : undefined}>
                    <td className={clsx('px-4 py-2', r.sub && 'pl-8 text-xs text-anthracite-500', r.strong && 'font-semibold')}>{r.label}</td>
                    {years.map((y) => {
                      const v = r.get(y);
                      return (
                        <td key={y.year} className={clsx('px-4 py-2 text-right tabular-nums', r.sub && 'text-xs text-anthracite-500',
                          r.strong && 'font-semibold', !r.negative && v < 0 && 'text-red-700')}>
                          {r.negative && v > 0 ? `− ${formatEuros(Math.round(v / 100) * 100, true)}` : formatEuros(Math.round(v / 100) * 100, true)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr>
                  <td className="px-4 py-2">Portefeuille clients abonnés (fin d’année)</td>
                  {years.map((y) => <td key={y.year} className="px-4 py-2 text-right tabular-nums">{Math.round(y.activeSubscriptionsEnd)}</td>)}
                </tr>
                <tr>
                  <td className="px-4 py-2">Ventes directes</td>
                  {years.map((y) => <td key={y.year} className="px-4 py-2 text-right tabular-nums">{Math.round(y.directSales * 10) / 10}</td>)}
                </tr>
              </tbody>
            </table>
          </Card>

          <Card className="p-4">
            <p className="text-xs font-medium text-anthracite-500">MRR — réel (trait plein) puis prévision {LABELS[selected]?.toLowerCase()} (pointillés)</p>
            <MonthlyLine data={mrrChart} height={240} series={[
              { key: 'real', name: 'MRR réel', color: CHART.axis },
              { key: 'forecast', name: `MRR prévu (${LABELS[selected]?.toLowerCase()})`, color: CHART.scenario[selected]!, dashed: true },
            ]} />
          </Card>

          <Card className="p-4">
            <p className="text-xs font-medium text-anthracite-500">Trésorerie cumulée prévue — comparaison des 3 scénarios</p>
            <MonthlyLine data={cashChart} height={240} series={ORDER.map((k) => ({ key: k, name: LABELS[k]!, color: CHART.scenario[k]! }))} />
          </Card>
        </div>

        <Card className="h-fit p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Hypothèses · {LABELS[selected]}</h2>
            {dirty && (
              <button
                className="inline-flex items-center gap-1 text-xs text-anthracite-500 hover:text-anthracite"
                onClick={() => {
                  if (!current) return;
                  const a = withDefaults(current.assumptions);
                  setDrafts((d) => ({ ...d, [selected]: Object.fromEntries(FIELDS.map((f) => [f.key, toInput(a[f.key] as number, f.unit)])) }));
                }}
              >
                <RotateCcw className="h-3 w-3" /> Annuler les modifications
              </button>
            )}
          </div>
          <div className="space-y-4">
            {groups.map((g) => (
              <fieldset key={g} className="space-y-2">
                <legend className="text-xs font-medium uppercase tracking-wider text-anthracite-500">{g}</legend>
                {FIELDS.filter((f) => f.group === g).map((f) => (
                  <Field key={f.key} label={f.label}>
                    {(id) => (
                      <Input
                        id={id}
                        inputMode="decimal"
                        invalid={invalid.includes(f.key)}
                        className="h-9"
                        value={drafts[selected]?.[f.key] ?? ''}
                        onChange={(e) => setDrafts((d) => ({ ...d, [selected]: { ...d[selected], [f.key]: e.target.value } }))}
                      />
                    )}
                  </Field>
                ))}
              </fieldset>
            ))}
            {lastReal && Number(lastReal.active_subscriptions) > 0 && (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1 accent-terracotta" checked={useOpening} onChange={(e) => setUseOpening(e.target.checked)} />
                <span>
                  Partir du portefeuille actuel
                  <span className="block text-xs text-anthracite-500">
                    {Number(lastReal.active_subscriptions)} abonnés · MRR {formatEuros(Number(lastReal.mrr_cents))} (réel)
                  </span>
                </span>
              </label>
            )}
            <Field label="Trésorerie de départ (€)" hint="Non enregistrée, pour simuler.">
              {(id) => <Input id={id} inputMode="decimal" className="h-9" value={opening} onChange={(e) => setOpening(e.target.value)} />}
            </Field>
          </div>
          {invalid.length > 0 && <div className="mt-3"><Alert>Certaines valeurs sont invalides (en rouge) : elles sont ignorées dans le calcul.</Alert></div>}
          {save.isError && <div className="mt-3"><Alert>{humanizeError(save.error)}</Alert></div>}
          {save.isSuccess && !dirty && <div className="mt-3"><Alert tone="success">Scénario enregistré.</Alert></div>}
          <Button className="mt-4 w-full" disabled={!dirty || invalid.length > 0} loading={save.isPending} onClick={() => save.mutate()}>
            Enregistrer le scénario {LABELS[selected]?.toLowerCase()}
          </Button>
        </Card>
      </div>
    </>
  );
}
