import { describe, expect, it } from 'vitest';
import { byYear, runForecast, survival, type Assumptions } from './forecast';

// Scénario initial du cahier des charges
const central: Assumptions = {
  new_subscriptions_per_month: 5,
  direct_sales_per_month: 1,
  renewal_rate_bps: 10000,
  subscription_price_cents: 2900,
  setup_fee_cents: 3900,
  direct_sale_price_cents: 50000,
  planning_attach_rate_bps: 0,
  planning_price_cents: 2000,
  variable_cost_per_sub_cents: 500,
  fixed_costs_monthly_cents: 10000,
  salary_costs_monthly_cents: 0,
  contributions_provision_bps: 2500,
};

describe('prévisionnel — scénario central', () => {
  const months = runForecast(central, 2026, 10);

  it('couvre octobre N à décembre N+2 (27 mois)', () => {
    expect(months).toHaveLength(27);
    expect(months[0]).toMatchObject({ year: 2026, month: 10 });
    expect(months.at(-1)).toMatchObject({ year: 2028, month: 12 });
  });

  it('1er mois : CA = 5×29 + 5×39 + 500 = 840 €', () => {
    const m = months[0]!;
    expect(m.revenueSubscriptions).toBe(14500);
    expect(m.revenueSetup).toBe(19500);
    expect(m.revenueDirect).toBe(50000);
    expect(m.revenue).toBe(84000);
  });

  it('commissions : 50 % au mois de souscription, 50 % deux mois après, 90 € par vente directe', () => {
    expect(months[0]!.commissions).toBe(5 * 2500 + 9000);
    expect(months[2]!.commissions).toBe(5 * 2500 + 5 * 2500 + 9000);
  });

  it('charges : coûts variables par abonné, frais fixes, provision 25 % du CA', () => {
    const m = months[0]!;
    expect(m.variableCosts).toBe(5 * 500);
    expect(m.fixedCosts).toBe(10000);
    expect(m.provision).toBe(84000 * 0.25);
    expect(m.net).toBe(84000 - 21500 - 2500 - 10000 - 21000);
  });

  it('renouvellement 100 % : 60 abonnés et MRR 1 740 € après 12 mois', () => {
    expect(months[11]!.activeSubscriptions).toBe(60);
    expect(months[11]!.mrr).toBe(174000);
  });

  it('agrégats annuels cohérents avec les mois', () => {
    const years = byYear(months);
    expect(years.map((y) => [y.year, y.months])).toEqual([[2026, 3], [2027, 12], [2028, 12]]);
    const total = months.reduce((s, m) => s + m.revenue, 0);
    expect(years.reduce((s, y) => s + y.revenue, 0)).toBeCloseTo(total, 6);
    expect(years[2]!.arrEnd).toBe(years[2]!.mrrEnd * 12);
    expect(years[2]!.cumulativeCashEnd).toBeCloseTo(months.at(-1)!.cumulativeCash, 6);
  });
});

describe('prévisionnel — renouvellement et options', () => {
  it('survie : 100 % pendant l’engagement, puis × taux à chaque échéance', () => {
    expect(survival(11, 8000)).toBe(1);
    expect(survival(12, 8000)).toBeCloseTo(0.8);
    expect(survival(24, 8000)).toBeCloseTo(0.64);
  });

  it('renouvellement 80 % : la 1re cohorte perd 20 % au 13e mois', () => {
    const m = runForecast({ ...central, renewal_rate_bps: 8000 }, 2026, 1);
    expect(m[11]!.activeSubscriptions).toBe(60);
    expect(m[12]!.activeSubscriptions).toBeCloseTo(60 + 5 - 1, 6); // 12 cohortes pleines + 1 cohorte à 80 %
  });

  it('option planning : prix moyen = 29 € + taux × 20 €', () => {
    const m = runForecast({ ...central, planning_attach_rate_bps: 5000 }, 2026, 1);
    expect(m[0]!.mrr).toBe(5 * (2900 + 1000));
  });

  it('salaires et apporteurs', () => {
    const m = runForecast({ ...central, salary_costs_monthly_cents: 200000, referral_share_bps: 5000 }, 2026, 1);
    expect(m[0]!.salaries).toBe(200000);
    expect(m[0]!.commissions).toBe(5 * (5000 + 0.5 * 3000) * 0.5 + (9000 + 0.5 * 5000));
  });

  it('trésorerie de départ prise en compte', () => {
    const m = runForecast(central, 2026, 12, 100000);
    expect(m[0]!.cumulativeCash).toBe(100000 + m[0]!.net);
  });
});

describe('prévisionnel — portefeuille de départ', () => {
  it('les abonnés existants s’ajoutent au MRR et aux coûts variables, sans frais ni commission', () => {
    const base = runForecast(central, 2026, 10);
    const withOpening = runForecast(central, 2026, 10, 0, { subscriptions: 20, mrrCents: 63800 });
    expect(withOpening[0]!.mrr).toBe(base[0]!.mrr + 63800);
    expect(withOpening[0]!.activeSubscriptions).toBe(25);
    expect(withOpening[0]!.commissions).toBe(base[0]!.commissions);
    expect(withOpening[0]!.revenueSetup).toBe(base[0]!.revenueSetup);
    expect(withOpening[0]!.variableCosts).toBe(25 * 500);
  });
  it('renouvellement appliqué au portefeuille existant', () => {
    const m = runForecast({ ...central, renewal_rate_bps: 5000, new_subscriptions_per_month: 0, direct_sales_per_month: 0 }, 2026, 1, 0, { subscriptions: 10, mrrCents: 29000 });
    expect(m[11]!.mrr).toBe(29000);
    expect(m[12]!.mrr).toBe(14500);
  });
});
