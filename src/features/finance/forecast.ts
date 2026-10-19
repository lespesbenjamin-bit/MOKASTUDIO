// Moteur prévisionnel — fonctions pures, testées (forecast.test.ts).
// Hypothèses en centimes et en points de base (bps : 10000 = 100 %).
// Les volumes peuvent être décimaux (1,5 vente/mois = valeur moyenne attendue).

export type Assumptions = {
  new_subscriptions_per_month: number;
  direct_sales_per_month: number;
  renewal_rate_bps: number;          // part des abonnés qui renouvellent à chaque échéance d'engagement
  subscription_price_cents: number;
  setup_fee_cents: number;
  direct_sale_price_cents: number;
  planning_attach_rate_bps: number;  // part des nouveaux abonnés qui prennent l'option planning
  planning_price_cents: number;
  variable_cost_per_sub_cents: number;
  fixed_costs_monthly_cents: number;
  salary_costs_monthly_cents: number;
  contributions_provision_bps: number;
  // Commissions (facultatif : valeurs par défaut = grille initiale)
  commercial_sub_commission_cents?: number;
  commercial_direct_commission_cents?: number;
  referral_share_bps?: number;       // part des ventes apportées par un apporteur
  referrer_sub_commission_cents?: number;
  referrer_direct_commission_cents?: number;
  commitment_months?: number;
};

export const COMMISSION_DEFAULTS = {
  commercial_sub_commission_cents: 5000,
  commercial_direct_commission_cents: 9000,
  referral_share_bps: 0,
  referrer_sub_commission_cents: 3000,
  referrer_direct_commission_cents: 5000,
  commitment_months: 12,
} as const;

export type MonthRow = {
  index: number;            // 0 = premier mois du prévisionnel
  year: number;
  month: number;            // 1-12
  newSubscriptions: number;
  directSales: number;
  activeSubscriptions: number;
  mrr: number;
  revenueSubscriptions: number;
  revenueSetup: number;
  revenueDirect: number;
  revenue: number;
  commissions: number;
  variableCosts: number;
  fixedCosts: number;
  salaries: number;
  provision: number;
  net: number;
  cumulativeCash: number;
};

export type YearRow = Omit<MonthRow, 'index' | 'month' | 'mrr' | 'activeSubscriptions' | 'cumulativeCash'> & {
  months: number;
  mrrEnd: number;
  arrEnd: number;
  activeSubscriptionsEnd: number;
  cumulativeCashEnd: number;
};

/** Part d'une cohorte encore abonnée `age` mois après sa souscription. */
export function survival(age: number, renewalBps: number, commitment = 12): number {
  const renewals = Math.floor(age / commitment);
  return Math.pow(renewalBps / 10000, renewals);
}

/**
 * Calcule le prévisionnel mois par mois, du mois de départ jusqu'à décembre N+2.
 * startYear / startMonth : 1er mois prévisionnel (ex. 2026, 10).
 * openingCash : trésorerie de départ (centimes), 0 par défaut.
 * opening : abonnés déjà en portefeuille au départ (réel) ; ils renouvellent
 *           au même taux, 12 mois après le départ (hypothèse simplificatrice).
 */
export type OpeningPortfolio = { subscriptions: number; mrrCents: number };

export function runForecast(
  a: Assumptions, startYear: number, startMonth: number, openingCash = 0, opening?: OpeningPortfolio,
): MonthRow[] {
  const c = { ...COMMISSION_DEFAULTS, ...stripUndefined(a) };
  const total = (startYear + 2 - startYear) * 12 + (12 - startMonth + 1);
  const months: MonthRow[] = [];
  const cohorts: number[] = [];           // nouveaux abonnés par mois
  const subPrice = a.subscription_price_cents + (a.planning_attach_rate_bps / 10000) * a.planning_price_cents;
  const refShare = c.referral_share_bps / 10000;
  const t1 = 0.5; // 50 % au 1er encaissement, 50 % à la 3e mensualité (grille validée)
  let cash = openingCash;

  for (let i = 0; i < total; i++) {
    const monthAbs = startMonth - 1 + i;
    const year = startYear + Math.floor(monthAbs / 12);
    const month = (monthAbs % 12) + 1;

    const newSubs = a.new_subscriptions_per_month;
    const direct = a.direct_sales_per_month;
    cohorts.push(newSubs);

    let active = 0;
    cohorts.forEach((n, ci) => { active += n * survival(i - ci, a.renewal_rate_bps, c.commitment_months); });
    const openingAlive = opening && opening.subscriptions > 0 ? survival(i, a.renewal_rate_bps, c.commitment_months) : 0;
    const openingMrr = opening ? opening.mrrCents * openingAlive : 0;
    active += opening ? opening.subscriptions * openingAlive : 0;

    const mrr = (active - (opening ? opening.subscriptions * openingAlive : 0)) * subPrice + openingMrr;
    const revenueSubscriptions = mrr;                 // 1re mensualité encaissée le mois de souscription
    const revenueSetup = newSubs * a.setup_fee_cents;
    const revenueDirect = direct * a.direct_sale_price_cents;
    const revenue = revenueSubscriptions + revenueSetup + revenueDirect;

    // Commissions abonnement : tranche 1 le mois de souscription, tranche 2 deux mois plus tard (3e mensualité)
    const subCommission = c.commercial_sub_commission_cents + refShare * c.referrer_sub_commission_cents;
    const thirdPaymentCohort = i >= 2 ? cohorts[i - 2]! * survival(2, a.renewal_rate_bps, c.commitment_months) : 0;
    const commissions =
      newSubs * subCommission * t1 +
      thirdPaymentCohort * subCommission * (1 - t1) +
      direct * (c.commercial_direct_commission_cents + refShare * c.referrer_direct_commission_cents);

    const variableCosts = active * a.variable_cost_per_sub_cents;
    const fixedCosts = a.fixed_costs_monthly_cents;
    const salaries = a.salary_costs_monthly_cents;
    const provision = revenue * (a.contributions_provision_bps / 10000);
    const net = revenue - commissions - variableCosts - fixedCosts - salaries - provision;
    cash += net;

    months.push({
      index: i, year, month, newSubscriptions: newSubs, directSales: direct, activeSubscriptions: active, mrr,
      revenueSubscriptions, revenueSetup, revenueDirect, revenue, commissions, variableCosts, fixedCosts,
      salaries, provision, net, cumulativeCash: cash,
    });
  }
  return months;
}

export function byYear(months: MonthRow[]): YearRow[] {
  const groups = new Map<number, MonthRow[]>();
  months.forEach((m) => groups.set(m.year, [...(groups.get(m.year) ?? []), m]));
  return [...groups.entries()].map(([year, rows]) => {
    const sum = (k: keyof MonthRow) => rows.reduce((s, r) => s + (r[k] as number), 0);
    const last = rows[rows.length - 1]!;
    return {
      year, months: rows.length,
      newSubscriptions: sum('newSubscriptions'), directSales: sum('directSales'),
      revenueSubscriptions: sum('revenueSubscriptions'), revenueSetup: sum('revenueSetup'), revenueDirect: sum('revenueDirect'),
      revenue: sum('revenue'), commissions: sum('commissions'), variableCosts: sum('variableCosts'),
      fixedCosts: sum('fixedCosts'), salaries: sum('salaries'), provision: sum('provision'), net: sum('net'),
      mrrEnd: last.mrr, arrEnd: last.mrr * 12, activeSubscriptionsEnd: last.activeSubscriptions,
      cumulativeCashEnd: last.cumulativeCash,
    };
  });
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null)) as Partial<T>;
}
