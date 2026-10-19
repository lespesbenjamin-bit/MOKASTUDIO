import type {
  CommissionStatus, ContractStatus, OfferCode, PaymentKind, PaymentStatus, SiteStatus,
} from '@/types/database';

export const OFFER_LABELS: Record<OfferCode, string> = {
  abonnement: 'Abonnement', vente_directe: 'Vente directe', option_planning: 'Option planning',
};

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  brouillon: 'Brouillon', signe: 'Signé', actif: 'Actif', resilie: 'Résilié', termine: 'Terminé', annule: 'Annulé',
};
export const CONTRACT_STATUS_TONE: Record<ContractStatus, 'neutral' | 'success' | 'warning' | 'muted' | 'danger' | 'terracotta'> = {
  brouillon: 'muted', signe: 'terracotta', actif: 'success', resilie: 'danger', termine: 'muted', annule: 'danger',
};

export const SITE_STATUSES: SiteStatus[] = ['a_produire', 'en_cours', 'en_validation', 'en_ligne'];
export const SITE_STATUS_LABELS: Record<SiteStatus, string> = {
  a_produire: 'À produire', en_cours: 'En cours', en_validation: 'En validation', en_ligne: 'En ligne',
};

export const PAYMENT_KIND_LABELS: Record<PaymentKind, string> = {
  mise_en_service: 'Mise en service', mensualite: 'Mensualité', vente_directe: 'Vente directe', autre: 'Autre',
};
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  en_attente: 'À encaisser', encaisse: 'Encaissé', echoue: 'Échoué / annulé', rembourse: 'Remboursé',
};

export const COMMISSION_STATUSES: CommissionStatus[] = ['previsionnelle', 'acquise', 'facturee', 'payee', 'annulee'];
export const COMMISSION_STATUS_LABELS: Record<CommissionStatus, string> = {
  previsionnelle: 'Prévisionnelle', acquise: 'Acquise', facturee: 'Facturée', payee: 'Payée', annulee: 'Annulée',
};
export const COMMISSION_STATUS_TONE: Record<CommissionStatus, 'neutral' | 'success' | 'warning' | 'muted' | 'danger' | 'terracotta'> = {
  previsionnelle: 'muted', acquise: 'terracotta', facturee: 'warning', payee: 'success', annulee: 'danger',
};

const monthFmt = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

/** « 2026-10-01 » → « octobre 2026 » */
export function formatMonth(isoDate: string): string {
  const [y, m] = isoDate.split('-').map(Number);
  return monthFmt.format(new Date(y!, (m ?? 1) - 1, 1));
}

/** Date SQL (« 2026-10-15 ») ou ISO → « 15 oct. 2026 », sans décalage de fuseau */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return dateFmt.format(new Date(y!, m! - 1, d!));
  }
  return dateFmt.format(new Date(value));
}

export function todayInput(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function monthInput(offset = 0): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
