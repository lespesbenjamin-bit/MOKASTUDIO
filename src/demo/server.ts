// Faux serveur du mode démonstration : répond aux appels de supabase-js
// à partir de données fictives en mémoire. Aucune requête ne quitte le navigateur
// et toute tentative d'écriture est refusée.
import type { UserRole } from '@/types/database';
import {
  DEMO_COMMISSIONS, DEMO_CONTRACTS, DEMO_IDS, DEMO_LEADS, DEMO_MONTHLY, DEMO_OFFERS, DEMO_PAYMENTS, DEMO_PROFILES,
  DEMO_RULES, DEMO_SCENARIOS, DEMO_SETTINGS, DEMO_TASKS, DEMO_TIMELINE, DEMO_USERS, demoKpis,
} from './data';

export const DEMO_WRITE_MESSAGE = 'Mode démonstration : aucune modification n’est enregistrée.';

type Row = Record<string, unknown>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Applique les filtres PostgREST simples (eq, neq, in, is) de l'URL. */
function applyFilters(rows: Row[], params: URLSearchParams): Row[] {
  let out = rows;
  params.forEach((raw, key) => {
    if (['select', 'order', 'limit', 'offset', 'or'].includes(key)) return;
    const [op, ...rest] = raw.split('.');
    const value = rest.join('.');
    if (op === 'eq') out = out.filter((r) => String(r[key]) === value);
    else if (op === 'neq') out = out.filter((r) => String(r[key]) !== value);
    else if (op === 'is' && value === 'null') out = out.filter((r) => r[key] === null);
    else if (op === 'in') {
      const set = new Set(value.replace(/^\(|\)$/g, '').split(',').map((v) => v.replace(/^"|"$/g, '')));
      out = out.filter((r) => set.has(String(r[key])));
    }
  });
  return out;
}

function tables(role: UserRole, uid: string): Record<string, Row[]> {
  const mine = <T extends Row>(rows: T[], key: string) => (role === 'admin' ? rows : rows.filter((r) => r[key] === uid));
  const contracts = role === 'admin' ? DEMO_CONTRACTS : role === 'commercial' ? DEMO_CONTRACTS.filter((k) => k.owner_id === uid) : [];
  const contractIds = new Set(contracts.map((k) => k.id));
  return {
    profiles: role === 'admin' ? DEMO_PROFILES : DEMO_PROFILES.filter((p) => p.id === uid),
    lead_overview: role === 'apporteur' ? [] : mine(DEMO_LEADS, 'owner_id'),
    task_overview: role === 'apporteur' ? [] : mine(DEMO_TASKS, 'assignee_id'),
    contract_overview: contracts,
    payment_overview: DEMO_PAYMENTS.filter((p) => contractIds.has(p.contract_id)),
    commission_overview: role === 'apporteur' ? [] : mine(DEMO_COMMISSIONS, 'beneficiary_id'),
    offers: DEMO_OFFERS,
    commission_rules: role === 'admin' ? DEMO_RULES : DEMO_RULES.filter((r) => r.beneficiary_role === role),
    app_settings: role === 'admin' ? [DEMO_SETTINGS] : [],
    financial_scenarios: role === 'admin' ? DEMO_SCENARIOS : [],
  };
}

function rpc(name: string, body: Row, role: UserRole, uid: string): Response {
  switch (name) {
    case 'is_admin': return json(role === 'admin');
    case 'current_app_role': return json(role);
    case 'stale_lead_days': return json(14);
    case 'team_directory':
      return json(role === 'apporteur' ? [] : DEMO_PROFILES.filter((p) => p.role !== 'apporteur').map((p) => ({ id: p.id, full_name: p.full_name, role: p.role })));
    case 'lead_timeline': return json(role === 'apporteur' ? [] : DEMO_TIMELINE);
    case 'find_duplicates': return json([]);
    case 'my_referrals':
      return json(role !== 'apporteur' ? [] : DEMO_LEADS.filter((l) => l.referrer_id === uid).map((l) => ({
        id: l.id, company_name: l.company_name, city: l.city, status: l.status, created_at: l.created_at, status_changed_at: l.status_changed_at,
      })));
    case 'my_commissions':
      return json(DEMO_COMMISSIONS.filter((c) => c.beneficiary_id === uid).map((c) => ({
        id: c.id, offer_code: c.offer_code, tranche: c.tranche, amount_cents: c.amount_cents, status: c.status, acquired_at: c.acquired_at,
        paid_at: c.paid_at, company_name: c.company_name, signed_at: c.signed_at, trigger_kind: c.trigger_kind, required_payments: c.required_payments,
      })));
    case 'dashboard_kpis': return role === 'admin' ? json(demoKpis()) : json({ message: 'Réservé aux administrateurs' }, 403);
    case 'dashboard_monthly': return json(role === 'admin' ? DEMO_MONTHLY : []);
    default:
      void body;
      return json({ code: 'DEMO', message: DEMO_WRITE_MESSAGE }, 400);
  }
}

export async function demoFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const role = currentDemoRole();
  const uid = DEMO_USERS[role].id;
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  await new Promise((r) => setTimeout(r, 120)); // petite latence réaliste

  if (url.pathname.startsWith('/functions/')) return json({ error: DEMO_WRITE_MESSAGE }, 400);
  if (url.pathname.startsWith('/auth/')) {
    if (url.pathname.endsWith('/logout')) return new Response(null, { status: 204 });
    if (url.pathname.endsWith('/user') && method === 'GET') return json(demoSession(role).user);
    return json({ error: 'demo', error_description: DEMO_WRITE_MESSAGE, msg: DEMO_WRITE_MESSAGE }, 400);
  }

  const rpcMatch = url.pathname.match(/\/rest\/v1\/rpc\/([a-z_]+)/);
  if (rpcMatch) {
    let body: Row = {};
    try { body = init?.body ? JSON.parse(String(init.body)) : {}; } catch { /* corps vide */ }
    return rpc(rpcMatch[1]!, body, role, uid);
  }

  const tableMatch = url.pathname.match(/\/rest\/v1\/([a-z_]+)/);
  if (tableMatch) {
    if (method !== 'GET' && method !== 'HEAD') return json({ code: 'DEMO', message: DEMO_WRITE_MESSAGE }, 400);
    const rows = applyFilters(tables(role, uid)[tableMatch[1]!] ?? [], url.searchParams);
    if ((headers.get('Accept') ?? '').includes('vnd.pgrst.object')) {
      return rows.length === 1 ? json(rows[0]) : json({ code: 'PGRST116', message: 'Aucune ligne' }, 406);
    }
    return json(rows);
  }
  return json({ message: 'Introuvable' }, 404);
}

// --- Session et rôle de démonstration ------------------------------------------
const ROLE_KEY = 'moka-demo-role';

export function currentDemoRole(): UserRole {
  try {
    const r = sessionStorage.getItem(ROLE_KEY);
    return r === 'commercial' || r === 'apporteur' ? r : 'admin';
  } catch {
    return 'admin';
  }
}

export function setDemoRole(role: UserRole) {
  try { sessionStorage.setItem(ROLE_KEY, role); } catch { /* ignore */ }
}

export function demoSession(role: UserRole) {
  const u = DEMO_USERS[role];
  return {
    access_token: 'demo', refresh_token: 'demo', token_type: 'bearer', expires_in: 3600 * 24,
    expires_at: Math.floor(Date.now() / 1000) + 3600 * 24,
    user: { id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, app_metadata: {}, user_metadata: {}, created_at: '' },
  };
}

export { DEMO_IDS };
