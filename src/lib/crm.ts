import type { ActivityKind, LeadSource, LeadStatus, TaskPriority, TaskStatus, TaskType } from '@/types/database';

/** Ordre = colonnes du Kanban */
export const LEAD_STATUSES: LeadStatus[] = [
  'a_contacter', 'contacte', 'interesse', 'rdv_programme', 'proposition_envoyee', 'negociation', 'gagne', 'perdu',
];

export const STATUS_LABELS: Record<LeadStatus, string> = {
  a_contacter: 'À contacter',
  contacte: 'Contacté',
  interesse: 'Intéressé',
  rdv_programme: 'Rendez-vous programmé',
  proposition_envoyee: 'Proposition envoyée',
  negociation: 'Négociation',
  gagne: 'Gagné',
  perdu: 'Perdu',
};

/** Pastille de couleur par statut (progression du beige vers le terracotta) */
export const STATUS_DOT: Record<LeadStatus, string> = {
  a_contacter: 'bg-anthracite-300',
  contacte: 'bg-[#C9B8A6]',
  interesse: 'bg-[#D9A68F]',
  rdv_programme: 'bg-[#C98468]',
  proposition_envoyee: 'bg-terracotta',
  negociation: 'bg-terracotta-700',
  gagne: 'bg-emerald-600',
  perdu: 'bg-red-700',
};

export const OPEN_STATUSES: LeadStatus[] = LEAD_STATUSES.filter((s) => s !== 'gagne' && s !== 'perdu');

export const SOURCE_LABELS: Record<LeadSource, string> = {
  prospection: 'Prospection',
  apporteur: 'Apporteur',
  site_web: 'Site web',
  recommandation: 'Recommandation',
  reseaux_sociaux: 'Réseaux sociaux',
  salon: 'Salon / événement',
  autre: 'Autre',
};

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  appeler: 'Appeler',
  email: 'Envoyer un email',
  sms: 'Envoyer un SMS',
  relancer: 'Relancer',
  rendez_vous: 'Organiser un rendez-vous',
  proposition: 'Envoyer une proposition',
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  basse: 'Basse', normale: 'Normale', haute: 'Haute', urgente: 'Urgente',
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  a_faire: 'À faire', en_cours: 'En cours', fait: 'Fait', annule: 'Annulé',
};

export const ACTIVITY_LABELS: Record<ActivityKind, string> = {
  creation: 'Prospect créé',
  note: 'Note',
  appel: 'Appel',
  email: 'Email',
  sms: 'SMS',
  rendez_vous: 'Rendez-vous',
  changement_statut: 'Statut modifié',
  changement_responsable: 'Responsable modifié',
  conversion: 'Converti en client',
};

/** Types d'activité qu'un utilisateur peut consigner à la main */
export const LOGGABLE_ACTIVITIES = ['note', 'appel', 'email', 'sms', 'rendez_vous'] as const;
export type LoggableActivity = (typeof LOGGABLE_ACTIVITIES)[number];

// --- Dates ------------------------------------------------------------------
const dayFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const dayYearFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Nombre de jours calendaires entre aujourd'hui et la date (négatif = passé). */
export function daysFromToday(iso: string, now = new Date()): number {
  return Math.round((startOfDay(new Date(iso)).getTime() - startOfDay(now).getTime()) / 86_400_000);
}

export function formatDay(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const diff = daysFromToday(iso, now);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return 'Demain';
  if (diff === -1) return 'Hier';
  return d.getFullYear() === now.getFullYear() ? dayFmt.format(d) : dayYearFmt.format(d);
}

export function formatDateTime(iso: string, now = new Date()): string {
  return `${formatDay(iso, now)} à ${timeFmt.format(new Date(iso))}`;
}

export function formatAgo(iso: string, now = new Date()): string {
  const days = -daysFromToday(iso, now);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return 'hier';
  if (days < 30) return `il y a ${days} j`;
  const months = Math.floor(days / 30);
  return months < 12 ? `il y a ${months} mois` : `il y a ${Math.floor(months / 12)} an${months >= 24 ? 's' : ''}`;
}

/** « 2026-10-20 » (champ date) → ISO à 9 h heure locale */
export function dateInputToIso(value: string, hour = 9): string | null {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, hour, 0, 0).toISOString();
}

/** ISO → « 2026-10-20 » pour un champ date */
export function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** ISO → « 2026-10-20T09:00 » pour un champ datetime-local */
export function isoToDateTimeInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${isoToDateInput(iso)}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function contactName(first: string | null | undefined, last: string | null | undefined): string {
  return [first, last].filter(Boolean).join(' ');
}

/** Lien tel: utilisable sur mobile */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

/** Recherche insensible aux accents et à la casse */
export function normalizeSearch(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
