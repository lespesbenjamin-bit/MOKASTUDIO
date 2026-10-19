import type { UserRole } from '@/types/database';

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrateur',
  commercial: 'Commercial',
  apporteur: 'Apporteur d\'affaires',
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  admin: 'Accès complet : comptes, attributions, commissions, finances, paramétrage.',
  commercial: 'Ses prospects et clients, relances, rendez-vous, ventes et commissions.',
  apporteur: 'Dépose des prospects, suit leur statut et ses commissions.',
};

export const ALL_ROLES: UserRole[] = ['admin', 'commercial', 'apporteur'];
