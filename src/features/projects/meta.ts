import type { ProjectOverview, ProjectStatus, QuestionnaireStatus } from '@/types/database';

/** Colonnes du Kanban, dans l'ordre */
export const PROJECT_COLUMNS: ProjectStatus[] = [
  'en_attente_infos', 'questionnaire_recu', 'brief_a_valider', 'pret_a_produire',
  'en_creation', 'en_validation_client', 'pret_a_publier', 'livre',
];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  en_attente_infos: 'En attente d’informations',
  questionnaire_recu: 'Questionnaire reçu',
  brief_a_valider: 'Brief à valider',
  pret_a_produire: 'Prêt à produire',
  en_creation: 'En création',
  en_validation_client: 'En validation client',
  pret_a_publier: 'Prêt à publier',
  livre: 'Livré',
  annule: 'Annulé',
};

export const PROJECT_STATUS_DOT: Record<ProjectStatus, string> = {
  en_attente_infos: 'bg-anthracite-300',
  questionnaire_recu: 'bg-[#C9B8A6]',
  brief_a_valider: 'bg-[#D9A68F]',
  pret_a_produire: 'bg-[#C98468]',
  en_creation: 'bg-terracotta',
  en_validation_client: 'bg-terracotta-700',
  pret_a_publier: 'bg-[#1D7FB8]',
  livre: 'bg-emerald-600',
  annule: 'bg-red-700',
};

export const QUESTIONNAIRE_LABELS: Record<QuestionnaireStatus, string> = {
  non_commence: 'Non commencé',
  en_cours: 'En cours',
  recu: 'Reçu',
};

export const EVENT_LABELS: Record<string, string> = {
  projet_cree: 'Questionnaire créé',
  lien_cree: 'Lien client créé',
  lien_revoque: 'Lien client désactivé',
  questionnaire_commence: 'Questionnaire commencé',
  questionnaire_recu: 'Questionnaire terminé',
  documents_ajoutes: 'Document ajouté',
  document_supprime: 'Document retiré',
  infos_manquantes: 'Informations manquantes',
  brief_genere: 'Brief généré',
  brief_valide: 'Brief validé',
  statut: 'Changement de statut',
  commentaire: 'Commentaire',
  modification: 'Modification',
};


const DAY = 86_400_000;
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
export const daysSince = (iso: string | null | undefined, now = new Date()) =>
  iso ? Math.floor((now.getTime() - new Date(iso).getTime()) / DAY) : null;

/** Questionnaire sans réponse depuis plus de N jours (à relancer) */
export const STALE_QUESTIONNAIRE_DAYS = 4;

export function isClosed(p: Pick<ProjectOverview, 'status'>) {
  return p.status === 'livre' || p.status === 'annule';
}

export function daysLeft(p: Pick<ProjectOverview, 'target_date'>): number | null {
  if (!p.target_date) return null;
  return Math.round((new Date(`${p.target_date}T00:00:00`).getTime() - today().getTime()) / DAY);
}

/** Prochaine action suggérée (si aucune n'a été saisie). */
export function suggestedAction(p: ProjectOverview, now = new Date()): string | null {
  if (p.next_action) return p.next_action;
  switch (p.status) {
    case 'en_attente_infos': {
      if (p.questionnaire_status === 'non_commence') {
        return p.link_active ? 'Relancer le client : questionnaire non commencé' : 'Envoyer le questionnaire au client';
      }
      const idle = daysSince(p.last_saved_at, now);
      return idle !== null && idle >= STALE_QUESTIONNAIRE_DAYS
        ? `Relancer le client (questionnaire à ${p.completion_pct ?? 0} %)`
        : `Questionnaire en cours (${p.completion_pct ?? 0} %)`;
    }
    case 'questionnaire_recu': return 'Générer le brief de développement';
    case 'brief_a_valider': return 'Relire et valider le brief';
    case 'pret_a_produire': return 'Démarrer la création du site';
    case 'en_creation': return 'Présenter le site au client';
    case 'en_validation_client': return 'Recueillir la validation du client';
    case 'pret_a_publier': return 'Mettre le site en ligne';
    default: return null;
  }
}

/** Le projet demande une action de l'équipe (encart d'accueil) */
export function needsAction(p: ProjectOverview, now = new Date()): boolean {
  if (isClosed(p)) return false;
  if (p.is_late) return true;
  if (['questionnaire_recu', 'brief_a_valider', 'pret_a_produire', 'pret_a_publier'].includes(p.status)) return true;
  if (p.status === 'en_attente_infos') {
    if (!p.link_active && p.questionnaire_status === 'non_commence') return true;
    const idle = daysSince(p.last_saved_at ?? p.created_at, now);
    return idle !== null && idle >= STALE_QUESTIONNAIRE_DAYS;
  }
  return false;
}

export type ProjectKpis = Record<
  'waiting' | 'partial' | 'received' | 'ready' | 'building' | 'validation' | 'delivered' | 'late', number>;

export function projectKpis(list: ProjectOverview[]): ProjectKpis {
  const open = list.filter((p) => p.status !== 'annule');
  const k = (f: (p: ProjectOverview) => boolean) => open.filter(f).length;
  return {
    waiting: k((p) => p.status === 'en_attente_infos' && p.questionnaire_status === 'non_commence'),
    partial: k((p) => p.status === 'en_attente_infos' && p.questionnaire_status === 'en_cours'),
    received: k((p) => p.status === 'questionnaire_recu' || p.status === 'brief_a_valider'),
    ready: k((p) => p.status === 'pret_a_produire'),
    building: k((p) => p.status === 'en_creation'),
    validation: k((p) => p.status === 'en_validation_client' || p.status === 'pret_a_publier'),
    delivered: k((p) => p.status === 'livre'),
    late: k((p) => p.is_late),
  };
}
