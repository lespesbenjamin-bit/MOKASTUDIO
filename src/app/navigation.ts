import {
  BarChart3, Briefcase, Wallet, CalendarCheck, Coins, FileSignature, Home, LineChart, Map, Send, Settings, UserCircle, Users,
  type LucideIcon,
} from 'lucide-react';
import type { UserRole } from '@/types/database';

export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: UserRole[];
  /** Étape du projet à laquelle le module sera livré (absent = disponible) */
  comingInStep?: number;
};

export type NavSection = { title?: string; items: NavItem[] };

export const NAV: NavSection[] = [
  {
    items: [
      { to: '/', label: 'Accueil', icon: Home, roles: ['admin', 'commercial', 'apporteur'] },
      { to: '/tableau-de-bord', label: 'Tableau de bord', icon: BarChart3, roles: ['admin'] },
    ],
  },
  {
    title: 'Commercial',
    items: [
      { to: '/prospects', label: 'Prospects', icon: Briefcase, roles: ['admin', 'commercial'] },
      { to: '/relances', label: 'Mes relances', icon: CalendarCheck, roles: ['admin', 'commercial'] },
      { to: '/carte', label: 'Carte & tournées', icon: Map, roles: ['admin', 'commercial'] },
      { to: '/clients', label: 'Clients & contrats', icon: FileSignature, roles: ['admin', 'commercial'] },
      { to: '/paiements', label: 'Paiements', icon: Wallet, roles: ['admin'] },
      { to: '/apports', label: 'Mes prospects transmis', icon: Send, roles: ['apporteur'] },
      { to: '/commissions', label: 'Commissions', icon: Coins, roles: ['admin', 'commercial', 'apporteur'] },
    ],
  },
  {
    title: 'Pilotage',
    items: [
      { to: '/finances', label: 'Finances & prévisionnel', icon: LineChart, roles: ['admin'] },
    ],
  },
  {
    title: 'Administration',
    items: [
      { to: '/parametres/utilisateurs', label: 'Utilisateurs', icon: Users, roles: ['admin'] },
      { to: '/parametres', label: 'Paramètres', icon: Settings, roles: ['admin'] },
    ],
  },
  {
    items: [{ to: '/mon-profil', label: 'Mon profil', icon: UserCircle, roles: ['admin', 'commercial', 'apporteur'] }],
  },
];

export function navFor(role: UserRole): NavSection[] {
  return NAV.map((s) => ({ ...s, items: s.items.filter((i) => i.roles.includes(role)) })).filter((s) => s.items.length);
}
