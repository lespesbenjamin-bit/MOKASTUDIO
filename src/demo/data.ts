// Données FICTIVES du mode démonstration. Aucun lien avec la base réelle.
// Les dates sont calculées par rapport au jour courant pour rester vraisemblables.
import type {
  CommissionOverview, ContractOverview, DashboardKpis, LeadOverview, LeadStatus, MapPoint, MonthlyPoint, OfferRow,
  PaymentOverview, ProfileRow, ScenarioRow, TaskOverview, TimelineEntry, UserRole,
} from '@/types/database';

export const DEMO_USERS: Record<UserRole, ProfileRow> = {
  admin: { id: 'd0000000-0000-0000-0000-00000000000a', role: 'admin', full_name: 'Alex Démo', email: 'admin@demo.fictif', phone: null, is_active: true, created_at: '', updated_at: '' },
  commercial: { id: 'd0000000-0000-0000-0000-00000000000c', role: 'commercial', full_name: 'Camille Exemple', email: 'camille@demo.fictif', phone: '06 00 00 00 01', is_active: true, created_at: '', updated_at: '' },
  apporteur: { id: 'd0000000-0000-0000-0000-00000000000e', role: 'apporteur', full_name: 'Agathe Partenaire', email: 'agathe@demo.fictif', phone: null, is_active: true, created_at: '', updated_at: '' },
};
const HUGO = { id: 'd0000000-0000-0000-0000-0000000000h1', full_name: 'Hugo Fictif' };
const CAM = DEMO_USERS.commercial;
const AGA = DEMO_USERS.apporteur;

export const DEMO_PROFILES: ProfileRow[] = [
  ...Object.values(DEMO_USERS),
  { ...DEMO_USERS.commercial, id: HUGO.id, full_name: HUGO.full_name, email: 'hugo@demo.fictif' },
];

const day = (offset: number, hour = 9) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};
const date = (offset: number) => day(offset).slice(0, 10);
const monthStart = (offset: number) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

type L = Partial<LeadOverview> & { id: string; company_name: string; status: LeadStatus };
const lead = (l: L): LeadOverview => ({
  company_id: `co-${l.id}`, contact_id: `ct-${l.id}`, source: 'prospection', owner_id: CAM.id, referrer_id: null,
  created_by: CAM.id, last_contact_at: day(-3), next_follow_up_at: null, status_changed_at: day(-4), lost_reason: null,
  notes: null, created_at: day(-30), updated_at: day(-1), siren: null, sector: 'Commerce', address: null,
  postal_code: '31000', city: 'Toulouse', website: null, contact_first_name: 'Marie', contact_last_name: 'Exemple',
  contact_email: null, contact_phone: '06 00 00 00 00', owner_name: CAM.full_name, referrer_name: null,
  last_activity_at: day(-3), open_tasks: 0, next_task_due_at: null, ...l,
});

export const DEMO_LEADS: LeadOverview[] = [
  lead({ id: 'l01', company_name: 'Salon Coiffure Lumière (fictif)', status: 'a_contacter', sector: 'Coiffure', next_follow_up_at: day(-1), open_tasks: 1 }),
  lead({ id: 'l02', company_name: 'Garage des Platanes (fictif)', status: 'a_contacter', city: 'Colomiers', postal_code: '31770', owner_id: null, owner_name: null, source: 'apporteur', referrer_id: AGA.id, referrer_name: AGA.full_name }),
  lead({ id: 'l03', company_name: 'Boulangerie du Canal (fictif)', status: 'contacte', owner_id: HUGO.id, owner_name: HUGO.full_name, sector: 'Boulangerie' }),
  lead({ id: 'l04', company_name: 'Institut Belle Peau (fictif)', status: 'interesse', city: 'Blagnac', next_follow_up_at: day(0), sector: 'Esthétique' }),
  lead({ id: 'l05', company_name: 'Fleuriste Pétales (fictif)', status: 'rdv_programme', city: 'Balma', next_follow_up_at: day(2), open_tasks: 1, sector: 'Fleuriste' }),
  lead({ id: 'l06', company_name: 'Plomberie Durand (fictif)', status: 'proposition_envoyee', city: 'Muret', owner_id: HUGO.id, owner_name: HUGO.full_name, sector: 'Artisan' }),
  lead({ id: 'l07', company_name: 'Cabinet Ostéo Sud (fictif)', status: 'negociation', last_activity_at: day(-20), last_contact_at: day(-20), sector: 'Santé' }),
  lead({ id: 'l08', company_name: 'Pizzeria Bella (fictif)', status: 'gagne', city: 'Tournefeuille', status_changed_at: day(-12) }),
  lead({ id: 'l09', company_name: 'Pressing Éclat (fictif)', status: 'perdu', lost_reason: 'Budget', status_changed_at: day(-8) }),
  lead({ id: 'l10', company_name: 'Auto-école Capitole (fictif)', status: 'contacte', last_activity_at: day(-18), last_contact_at: day(-18) }),
  lead({ id: 'l11', company_name: 'Librairie Les Pages (fictif)', status: 'interesse', source: 'apporteur', referrer_id: AGA.id, referrer_name: AGA.full_name }),
  lead({ id: 'l12', company_name: 'Traiteur Saveurs (fictif)', status: 'gagne', owner_id: HUGO.id, owner_name: HUGO.full_name, status_changed_at: day(-40) }),
];

const task = (t: Partial<TaskOverview> & { id: string; lead_id: string; title: string; due_at: string }): TaskOverview => ({
  customer_id: null, type: 'appeler', description: null, priority: 'normale', status: 'a_faire', assignee_id: CAM.id,
  created_by: CAM.id, completed_at: null, created_at: day(-5), updated_at: day(-1),
  company_name: DEMO_LEADS.find((l) => l.id === t.lead_id)?.company_name ?? null,
  lead_status: DEMO_LEADS.find((l) => l.id === t.lead_id)?.status ?? null, assignee_name: CAM.full_name, ...t,
});

export const DEMO_TASKS: TaskOverview[] = [
  task({ id: 't1', lead_id: 'l01', title: 'Rappeler la gérante', due_at: day(-1, 10), priority: 'haute' }),
  task({ id: 't2', lead_id: 'l05', title: 'Rendez-vous présentation maquette', type: 'rendez_vous', due_at: day(0, 14), description: 'Apporter des exemples de sites de fleuristes' }),
  task({ id: 't3', lead_id: 'l07', title: 'Relancer après négociation', type: 'relancer', due_at: day(3, 9), priority: 'urgente' }),
];

export const DEMO_TIMELINE: TimelineEntry[] = [
  { id: 'e1', kind: 'appel', from_value: null, to_value: null, body: 'Intéressée, souhaite voir des exemples. (exemple fictif)', occurred_at: day(-1, 11), actor_name: CAM.full_name },
  { id: 'e2', kind: 'changement_statut', from_value: 'contacte', to_value: 'interesse', body: null, occurred_at: day(-1, 11), actor_name: CAM.full_name },
  { id: 'e3', kind: 'changement_responsable', from_value: 'Non attribué', to_value: CAM.full_name, body: null, occurred_at: day(-6), actor_name: DEMO_USERS.admin.full_name },
  { id: 'e4', kind: 'creation', from_value: null, to_value: 'a_contacter', body: null, occurred_at: day(-7), actor_name: DEMO_USERS.admin.full_name },
];

const contract = (k: Partial<ContractOverview> & { id: string; reference: string; company_name: string; lead_id: string }): ContractOverview => ({
  customer_id: `cu-${k.id}`, offer_code: 'abonnement', status: 'actif', monthly_price_cents: 2900, setup_fee_cents: 3900,
  one_shot_price_cents: 0, with_planning_option: false, planning_monthly_cents: 0, signed_at: date(-60), activated_at: date(-50),
  commitment_months: 12, commitment_end_at: date(305), renewal: 'tacite', terminated_at: null, termination_reason: null,
  site_status: 'en_ligne', site_url: 'https://exemple.invalid', created_at: day(-60), company_id: `co-${k.id}`,
  owner_id: CAM.id, referrer_id: null, city: 'Toulouse', owner_name: CAM.full_name, subscription_id: `s-${k.id}`,
  subscription_status: 'active', monthly_amount_cents: 2900, next_due_on: monthStart(1), paid_cents: 12600, pending_cents: 0,
  overdue_payments: 0, ...k,
});

export const DEMO_CONTRACTS: ContractOverview[] = [
  contract({ id: 'k1', reference: 'DEMO-0001', company_name: 'Pizzeria Bella (fictif)', lead_id: 'l08', with_planning_option: true, planning_monthly_cents: 2000, monthly_amount_cents: 4900, signed_at: date(-12), activated_at: null, site_status: 'en_validation', site_url: null, status: 'signe', paid_cents: 3900, pending_cents: 4900, overdue_payments: 1 }),
  contract({ id: 'k2', reference: 'DEMO-0002', company_name: 'Traiteur Saveurs (fictif)', lead_id: 'l12', offer_code: 'vente_directe', monthly_price_cents: 0, setup_fee_cents: 0, one_shot_price_cents: 50000, subscription_id: null, subscription_status: null, monthly_amount_cents: null, renewal: 'aucun', commitment_months: 0, commitment_end_at: null, owner_id: HUGO.id, owner_name: HUGO.full_name, paid_cents: 50000, signed_at: date(-40) }),
  contract({ id: 'k3', reference: 'DEMO-0003', company_name: 'Bar Le Comptoir (fictif)', lead_id: 'l08', signed_at: date(-150), activated_at: date(-140), paid_cents: 3900 + 5 * 2900 }),
  contract({ id: 'k4', reference: 'DEMO-0004', company_name: 'Atelier Couture (fictif)', lead_id: 'l08', signed_at: date(-95), activated_at: date(-90), paid_cents: 3900 + 3 * 2900, referrer_id: AGA.id }),
];

const pay = (p: Partial<PaymentOverview> & { id: string; contract_id: string }): PaymentOverview => {
  const k = DEMO_CONTRACTS.find((c) => c.id === p.contract_id)!;
  return {
    subscription_id: k.subscription_id, kind: 'mensualite', amount_cents: 2900, due_on: monthStart(0), period_month: monthStart(0),
    status: 'encaisse', paid_at: day(-10), method: 'Prélèvement', external_ref: null, created_at: day(-30),
    contract_reference: k.reference, customer_id: k.customer_id, company_name: k.company_name, ...p,
  };
};

export const DEMO_PAYMENTS: PaymentOverview[] = [
  pay({ id: 'p1', contract_id: 'k1', kind: 'mise_en_service', amount_cents: 3900, period_month: null, due_on: date(-12), paid_at: day(-11), method: 'Virement' }),
  pay({ id: 'p2', contract_id: 'k1', amount_cents: 4900, due_on: date(-5), status: 'en_attente', paid_at: null, method: null }),
  pay({ id: 'p3', contract_id: 'k2', kind: 'vente_directe', amount_cents: 50000, period_month: null, due_on: date(-40), paid_at: day(-38), method: 'Virement' }),
  pay({ id: 'p4', contract_id: 'k3' }),
  pay({ id: 'p5', contract_id: 'k4' }),
  pay({ id: 'p6', contract_id: 'k3', due_on: monthStart(1), period_month: monthStart(1), status: 'en_attente', paid_at: null, method: null }),
];

const com = (c: Partial<CommissionOverview> & { id: string; contract_id: string; beneficiary_id: string; beneficiary_name: string }): CommissionOverview => {
  const k = DEMO_CONTRACTS.find((x) => x.id === c.contract_id)!;
  return {
    rule_id: 'r', beneficiary_role: 'commercial', offer_code: k.offer_code, tranche: 1, amount_cents: 2500,
    trigger_kind: 'premier_encaissement', required_payments: null, status: 'acquise', acquired_at: day(-10), invoiced_at: null,
    invoice_ref: null, paid_at: null, payout_ref: null, cancelled_at: null, cancel_reason: null, created_at: day(-12),
    contract_reference: k.reference, signed_at: k.signed_at, customer_id: k.customer_id, company_name: k.company_name, ...c,
  };
};

export const DEMO_COMMISSIONS: CommissionOverview[] = [
  com({ id: 'c1', contract_id: 'k1', beneficiary_id: CAM.id, beneficiary_name: CAM.full_name }),
  com({ id: 'c2', contract_id: 'k1', beneficiary_id: CAM.id, beneficiary_name: CAM.full_name, tranche: 2, trigger_kind: 'n_mensualites', required_payments: 3, status: 'previsionnelle', acquired_at: null }),
  com({ id: 'c3', contract_id: 'k2', beneficiary_id: HUGO.id, beneficiary_name: HUGO.full_name, amount_cents: 9000, status: 'payee', paid_at: day(-20), payout_ref: 'VIR-DEMO-01' }),
  com({ id: 'c4', contract_id: 'k4', beneficiary_id: AGA.id, beneficiary_name: AGA.full_name, beneficiary_role: 'apporteur', amount_cents: 1500, status: 'payee', paid_at: day(-60), payout_ref: 'VIR-DEMO-02' }),
  com({ id: 'c5', contract_id: 'k4', beneficiary_id: AGA.id, beneficiary_name: AGA.full_name, beneficiary_role: 'apporteur', amount_cents: 1500, tranche: 2, trigger_kind: 'n_mensualites', required_payments: 3, status: 'acquise' }),
  com({ id: 'c6', contract_id: 'k4', beneficiary_id: CAM.id, beneficiary_name: CAM.full_name, status: 'facturee', invoiced_at: day(-5) }),
];

export const DEMO_OFFERS: OfferRow[] = [
  { code: 'abonnement', label: 'Abonnement site', description: null, monthly_price_cents: 2900, setup_fee_cents: 3900, one_shot_price_cents: 0, commitment_months: 12, is_active: true, updated_by: null, created_at: '', updated_at: '' },
  { code: 'vente_directe', label: 'Vente directe', description: null, monthly_price_cents: 0, setup_fee_cents: 0, one_shot_price_cents: 50000, commitment_months: 0, is_active: true, updated_by: null, created_at: '', updated_at: '' },
  { code: 'option_planning', label: 'Option planning', description: null, monthly_price_cents: 2000, setup_fee_cents: 0, one_shot_price_cents: 0, commitment_months: 0, is_active: true, updated_by: null, created_at: '', updated_at: '' },
];

const rule = (role: 'commercial' | 'apporteur', offer: 'abonnement' | 'vente_directe' | 'option_planning', amount: number, split: boolean) => ({
  id: `${role}-${offer}`, beneficiary_role: role, offer_code: offer, amount_cents: amount,
  tranche1_bps: split ? 5000 : 10000, tranche2_bps: split ? 5000 : 0, tranche2_after_payments: split ? 3 : null,
  valid_from: day(-90), valid_to: null, created_by: null, created_at: day(-90),
});
export const DEMO_RULES = [
  rule('commercial', 'abonnement', 5000, true), rule('commercial', 'vente_directe', 9000, false), rule('commercial', 'option_planning', 0, true),
  rule('apporteur', 'abonnement', 3000, true), rule('apporteur', 'vente_directe', 5000, false), rule('apporteur', 'option_planning', 0, true),
];

export const DEMO_SETTINGS = {
  id: true, variable_cost_per_sub_cents: 500, fixed_costs_monthly_cents: 10000, contributions_provision_bps: 2500,
  creation_hour_cost_cents: 0, stale_lead_days: 14, updated_by: null, created_at: '', updated_at: '',
};

const baseAssumptions = {
  subscription_price_cents: 2900, setup_fee_cents: 3900, direct_sale_price_cents: 50000, planning_attach_rate_bps: 2000,
  planning_price_cents: 2000, variable_cost_per_sub_cents: 500, fixed_costs_monthly_cents: 10000, salary_costs_monthly_cents: 0,
  contributions_provision_bps: 2500,
};
export const DEMO_SCENARIOS: ScenarioRow[] = ([['prudent', 3, 0.5, 8000], ['central', 5, 1, 10000], ['ambitieux', 8, 2, 10000]] as const).map(([k, n, d, r]) => ({
  id: `sc-${k}`, name: k, kind: k, start_month: monthStart(0), horizon_years: 3, is_reference: true, created_by: null, created_at: '', updated_at: '',
  assumptions: { ...baseAssumptions, new_subscriptions_per_month: n, direct_sales_per_month: d, renewal_rate_bps: r },
}));

export const DEMO_MONTHLY: MonthlyPoint[] = Array.from({ length: 12 }, (_, i) => {
  const n = i - 4; // activité démarrée il y a 7 mois
  return {
    month: monthStart(i - 11),
    cash_in_cents: n < 0 ? 0 : 20000 + n * 12000 + (n % 3) * 15000,
    mrr_cents: n < 0 ? 0 : (n + 1) * 2 * 2900,
    contracts_signed: n < 0 ? 0 : 1 + (n % 3),
    active_subscriptions: n < 0 ? 0 : (n + 1) * 2,
  };
});

export function demoKpis(): DashboardKpis {
  const last = DEMO_MONTHLY.at(-1)!;
  return {
    leads_created: 12, leads_qualified: 6, meetings: 3, proposals: 2, won: 2, lost: 1, contracts_signed: 2, conversion_rate_bps: 6667,
    sales_by_owner: [{ name: CAM.full_name, contracts: 1, value_cents: 3900 + 4900 * 12 }, { name: HUGO.full_name, contracts: 1, value_cents: 50000 }],
    cash_in_cents: last.cash_in_cents, signed_unpaid_cents: 61800, mrr_cents: last.mrr_cents, arr_cents: last.mrr_cents * 12,
    active_subscriptions: last.active_subscriptions, new_subscriptions: 2, cancellations: 0,
    commissions_due_cents: 5500, commissions_forecast_cents: 2500, commissions_paid_cents: 9000,
    fixed_costs_cents: 10000, variable_costs_cents: last.active_subscriptions * 500, expenses_cents: 0,
    contributions_provision_cents: Math.round(last.cash_in_cents * 0.25),
    estimated_cash_cents: last.cash_in_cents - 9000 - 10000 - last.active_subscriptions * 500 - Math.round(last.cash_in_cents * 0.25),
    overdue_cents: 4900, period_days: 30,
  };
}

export const DEMO_IDS = { camille: CAM.id, hugo: HUGO.id, agathe: AGA.id };

// --- Carte : positions FICTIVES autour de Toulouse ------------------------------
const CITY_AT: Record<string, [number, number]> = {
  Toulouse: [43.6045, 1.444], Colomiers: [43.6112, 1.335], Blagnac: [43.6372, 1.3903],
  Balma: [43.611, 1.4994], Muret: [43.4614, 1.3267], Tournefeuille: [43.5853, 1.3442],
};
const jitter = (i: number) => [((i * 37) % 17 - 8) / 900, ((i * 53) % 19 - 9) / 700] as const;

export const DEMO_MAP_POINTS: MapPoint[] = [
  ...DEMO_LEADS.filter((l) => l.status !== 'gagne').map((l, i): MapPoint => {
    const [lat, lng] = CITY_AT[l.city ?? 'Toulouse'] ?? CITY_AT.Toulouse!;
    const [dy, dx] = jitter(i + 1);
    return {
      company_id: l.company_id, company_name: l.company_name, address: null, postal_code: l.postal_code, city: l.city,
      latitude: lat + dy, longitude: lng + dx, geocode_precision: i % 4 === 3 ? 'ville' : 'adresse', geocoded_at: day(-1),
      kind: 'prospect', status: l.status, lead_id: l.id, contract_id: null, owner_id: l.owner_id, owner_name: l.owner_name,
      source: l.source, next_follow_up_at: l.next_follow_up_at, contact_first_name: l.contact_first_name,
      contact_last_name: l.contact_last_name, contact_phone: l.contact_phone, offer_code: null, site_status: null, overdue_payments: 0,
    };
  }),
  ...DEMO_CONTRACTS.map((k, i): MapPoint => {
    const [lat, lng] = CITY_AT[k.city ?? 'Toulouse'] ?? CITY_AT.Toulouse!;
    const [dy, dx] = jitter(i + 20);
    return {
      company_id: k.company_id, company_name: k.company_name, address: null, postal_code: '31000', city: k.city,
      latitude: lat + dy, longitude: lng + dx, geocode_precision: 'adresse', geocoded_at: day(-1),
      kind: 'client', status: 'client', lead_id: k.lead_id, contract_id: k.id, owner_id: k.owner_id, owner_name: k.owner_name,
      source: null, next_follow_up_at: null, contact_first_name: null, contact_last_name: null, contact_phone: null,
      offer_code: k.offer_code, site_status: k.site_status, overdue_payments: k.overdue_payments,
    };
  }),
  // Une entreprise sans adresse exploitable, pour montrer la liste « non localisés »
  {
    company_id: 'co-sans-adresse', company_name: 'Food-truck Le Nomade (fictif)', address: null, postal_code: null, city: null,
    latitude: null, longitude: null, geocode_precision: null, geocoded_at: null, kind: 'prospect', status: 'a_contacter',
    lead_id: 'l01', contract_id: null, owner_id: CAM.id, owner_name: CAM.full_name, source: 'prospection', next_follow_up_at: null,
    contact_first_name: null, contact_last_name: null, contact_phone: null, offer_code: null, site_status: null, overdue_payments: 0,
  },
];
