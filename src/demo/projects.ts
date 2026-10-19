// Projets clients FICTIFS du mode démonstration.
import type {
  NotificationRow, PortalData, ProjectBriefRow, ProjectEventRow, ProjectFileRow, ProjectOverview, ProjectQuestionnaireRow,
  ProjectTaskRow, ProjectTokenRow,
} from '@/types/database';
import { generateBrief } from '@/features/projects/brief';
import { completion } from '@/features/projects/questions';
import { DEMO_CONTRACTS, DEMO_IDS, DEMO_USERS } from './data';

const ADMIN = DEMO_USERS.admin;
const day = (offset: number, hour = 10) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};
const date = (offset: number) => day(offset).slice(0, 10);
const contract = (id: string) => DEMO_CONTRACTS.find((k) => k.id === id)!;

const ANSWERS: Record<string, ProjectQuestionnaireRow['answers']> = {
  pj1: {
    nom_commercial: 'Pizzeria Bella (fictif)', secteur: 'restaurant', ville: 'Tournefeuille', code_postal: '31170',
    telephone: '06 00 00 00 02', horaires: 'Mardi au dimanche : 11h30 – 14h, 18h30 – 22h30',
    description_activite: 'Pizzeria artisanale au feu de bois, pâte maturée 48 h. (exemple fictif)',
    site_existant: 'non', objectifs: ['presenter', 'visibilite', 'contact'], pages: ['accueil', 'a_propos', 'contact'],
  },
  pj2: {
    nom_commercial: 'Traiteur Saveurs (fictif)', secteur: 'restaurant', adresse: '12 rue Exemple', code_postal: '31000', ville: 'Toulouse',
    telephone: '06 00 00 00 03', email_public: 'contact@traiteur.exemple', horaires: 'Du lundi au samedi, sur commande',
    description_activite: 'Traiteur pour particuliers et entreprises : buffets, cocktails, plateaux repas. (exemple fictif)',
    zone_geographique: 'Toulouse et 30 km alentour', site_existant: 'non',
    objectifs: ['presenter', 'contact', 'prestations_tarifs'], clientele_cible: 'Entreprises (séminaires) et particuliers (mariages, anniversaires).',
    pages: ['accueil', 'prestations', 'galerie', 'contact', 'faq'], logo_existant: 'oui', couleurs_principales: 'Vert olive, crème',
    ambiances: ['naturel', 'elegant'], presentation: 'Cuisine maison à partir de produits locaux. (exemple fictif)',
    prestations: 'Buffet froid\nCocktail dînatoire\nPlateaux repas', fonctionnalites: ['formulaire_contact', 'appel', 'galerie', 'reseaux'],
    instagram: '@traiteur.exemple',
  },
  pj3: { nom_commercial: 'Bar Le Comptoir (fictif)', secteur: 'restaurant', ville: 'Toulouse' },
  pj4: {
    nom_commercial: 'Atelier Couture (fictif)', secteur: 'commerce', ville: 'Toulouse', site_existant: 'non',
    objectifs: ['presenter', 'realisations'], pages: ['accueil', 'realisations', 'contact'], logo_existant: 'non',
    ambiances: ['creatif'], description_activite: 'Retouches et créations sur mesure. (exemple fictif)',
  },
};

const FILES: ProjectFileRow[] = [
  { id: 'f1', project_id: 'pj2', category: 'logo', storage_path: 'demo/f1.png', original_name: 'logo-traiteur.png', mime_type: 'image/png', size_bytes: 84_000, status: 'valide', uploaded_via: 'client', uploaded_by: null, created_at: day(-6), confirmed_at: day(-6) },
  { id: 'f2', project_id: 'pj2', category: 'photos_prestations', storage_path: 'demo/f2.jpg', original_name: 'buffet.jpg', mime_type: 'image/jpeg', size_bytes: 2_400_000, status: 'valide', uploaded_via: 'client', uploaded_by: null, created_at: day(-6), confirmed_at: day(-6) },
  { id: 'f3', project_id: 'pj2', category: 'plaquette_tarifaire', storage_path: 'demo/f3.pdf', original_name: 'tarifs-2026.pdf', mime_type: 'application/pdf', size_bytes: 310_000, status: 'valide', uploaded_via: 'client', uploaded_by: null, created_at: day(-5), confirmed_at: day(-5) },
  { id: 'f4', project_id: 'pj4', category: 'photos_realisations', storage_path: 'demo/f4.jpg', original_name: 'robe.jpg', mime_type: 'image/jpeg', size_bytes: 1_800_000, status: 'valide', uploaded_via: 'equipe', uploaded_by: DEMO_IDS.camille, created_at: day(-12), confirmed_at: day(-12) },
];

type Def = { id: string; k: string; status: ProjectOverview['status']; q: ProjectQuestionnaireRow['status']; target: number | null; created: number; link: boolean };
const DEFS: Def[] = [
  { id: 'pj1', k: 'k1', status: 'en_attente_infos', q: 'en_cours', target: null, created: -10, link: true },
  { id: 'pj2', k: 'k2', status: 'brief_a_valider', q: 'recu', target: null, created: -38, link: false },
  { id: 'pj3', k: 'k3', status: 'livre', q: 'recu', target: -142, created: -150, link: false },
  { id: 'pj4', k: 'k4', status: 'en_creation', q: 'recu', target: -2, created: -20, link: false },
];

export const DEMO_PROJECTS: ProjectOverview[] = DEFS.map((d) => {
  const k = contract(d.k);
  const files = FILES.filter((f) => f.project_id === d.id);
  return {
    id: d.id, customer_id: k.customer_id, contract_id: k.id, title: `Site internet — ${k.company_name}`, status: d.status,
    assignee_id: ADMIN.id, target_date: d.target === null ? null : date(d.target), scope_validated_at: d.target === null ? null : day(d.target - 10),
    delivered_at: d.status === 'livre' ? day(-141) : null, site_url: d.status === 'livre' ? 'https://exemple.invalid' : null,
    next_action: null, cancel_reason: null, status_changed_at: day(-3), last_activity_at: d.id === 'pj1' ? day(-6) : day(-1),
    created_by: k.owner_id, created_at: day(d.created), company_name: k.company_name, sector: 'Restauration', city: k.city,
    owner_id: k.owner_id, owner_name: k.owner_name, assignee_name: ADMIN.full_name, contract_reference: k.reference,
    offer_code: k.offer_code, with_planning_option: k.with_planning_option, questionnaire_status: d.q,
    completion_pct: completion(ANSWERS[d.id] ?? {}, files), submitted_at: d.q === 'recu' ? day(d.created + 4) : null,
    last_saved_at: day(d.id === 'pj1' ? -6 : d.created + 4), files_count: files.length, open_tasks: d.status === 'livre' ? 0 : 6,
    link_active: d.link, is_late: d.target !== null && d.target < 0 && d.status !== 'livre',
  };
});

export const DEMO_QUESTIONNAIRES: ProjectQuestionnaireRow[] = DEMO_PROJECTS.map((p) => ({
  project_id: p.id, status: p.questionnaire_status ?? 'non_commence', answers: ANSWERS[p.id] ?? {}, current_step: p.id === 'pj1' ? 1 : 5,
  completion_pct: p.completion_pct ?? 0, started_at: p.created_at, submitted_at: p.submitted_at, submitted_via: p.submitted_at ? 'client' : null,
  submitted_by: null, consent_at: p.submitted_at, last_saved_via: 'client', last_saved_at: p.last_saved_at, updated_at: p.last_saved_at ?? p.created_at,
}));

export const DEMO_PROJECT_FILES = FILES;

const TASK_TITLES = ['Analyser le questionnaire et les documents', 'Maquette de la page d’accueil', 'Intégration des contenus et photos',
  'Pages secondaires', 'Adaptation mobile et tablette', 'SEO de base (titres, descriptions, Google Business)', 'Présentation au client', 'Mise en ligne et nom de domaine'];
export const DEMO_PROJECT_TASKS: ProjectTaskRow[] = DEMO_PROJECTS.flatMap((p) => TASK_TITLES.map((title, i): ProjectTaskRow => {
  const done = p.status === 'livre' || (p.status === 'en_creation' && i < 3);
  return {
    id: `${p.id}-t${i}`, project_id: p.id, title, status: done ? 'fait' : p.status === 'en_creation' && i === 3 ? 'en_cours' : 'a_faire',
    assignee_id: ADMIN.id, due_on: null, position: i + 1, done_at: done ? day(-3) : null, created_by: ADMIN.id, created_at: p.created_at, updated_at: p.created_at,
  };
}));

export const DEMO_PROJECT_EVENTS: ProjectEventRow[] = [
  { id: 'e-pj1-1', project_id: 'pj1', kind: 'projet_cree', body: 'Projet et questionnaire créés (prérempli depuis le CRM)', from_value: null, to_value: null, actor_id: DEMO_IDS.camille, created_at: day(-10) },
  { id: 'e-pj1-2', project_id: 'pj1', kind: 'lien_cree', body: 'Lien valable 60 jours', from_value: null, to_value: null, actor_id: DEMO_IDS.camille, created_at: day(-10) },
  { id: 'e-pj1-3', project_id: 'pj1', kind: 'questionnaire_commence', body: 'Commencé par le client', from_value: null, to_value: null, actor_id: null, created_at: day(-6) },
  { id: 'e-pj2-1', project_id: 'pj2', kind: 'questionnaire_recu', body: 'Transmis par le client', from_value: null, to_value: null, actor_id: null, created_at: day(-34) },
  { id: 'e-pj2-2', project_id: 'pj2', kind: 'documents_ajoutes', body: 'Logo : logo-traiteur.png (envoyé par le client)', from_value: null, to_value: null, actor_id: null, created_at: day(-6) },
  { id: 'e-pj2-3', project_id: 'pj2', kind: 'brief_genere', body: 'Version 1', from_value: null, to_value: null, actor_id: ADMIN.id, created_at: day(-1) },
  { id: 'e-pj2-4', project_id: 'pj2', kind: 'statut', body: null, from_value: 'questionnaire_recu', to_value: 'brief_a_valider', actor_id: ADMIN.id, created_at: day(-1) },
  { id: 'e-pj4-1', project_id: 'pj4', kind: 'statut', body: 'Maquette validée oralement', from_value: 'pret_a_produire', to_value: 'en_creation', actor_id: ADMIN.id, created_at: day(-9) },
  { id: 'e-pj4-2', project_id: 'pj4', kind: 'commentaire', body: 'La cliente souhaite ajouter une page « Retouches express ». À valider commercialement. (exemple fictif)', from_value: null, to_value: null, actor_id: DEMO_IDS.camille, created_at: day(-4) },
  { id: 'e-pj3-1', project_id: 'pj3', kind: 'statut', body: null, from_value: 'pret_a_publier', to_value: 'livre', actor_id: ADMIN.id, created_at: day(-141) },
];

const pj2 = DEMO_PROJECTS.find((p) => p.id === 'pj2')!;
export const DEMO_PROJECT_BRIEFS: ProjectBriefRow[] = [{
  id: 'b1', project_id: 'pj2', version: 1, generated_by: ADMIN.id, created_at: day(-1), validated_at: null, validated_by: null,
  content: generateBrief({
    companyName: pj2.company_name, offerCode: pj2.offer_code, withPlanningOption: pj2.with_planning_option, contractReference: pj2.contract_reference,
    targetDate: null, answers: ANSWERS.pj2!, files: FILES.filter((f) => f.project_id === 'pj2').map((f) => ({ category: f.category, name: f.original_name })),
  }),
}];

export const DEMO_PROJECT_TOKENS: ProjectTokenRow[] = [
  { id: 'tok1', project_id: 'pj1', created_by: DEMO_IDS.camille, created_at: day(-10), expires_at: day(50), revoked_at: null, revoked_by: null, last_used_at: day(-6), use_count: 3 },
];

export function demoNotifications(uid: string): NotificationRow[] {
  const base = [
    { id: 'n1', project_id: 'pj2', kind: 'brief_genere', title: 'Brief généré — Traiteur Saveurs (fictif)', body: 'Version 1', created_at: day(-1), read_at: null },
    { id: 'n2', project_id: 'pj1', kind: 'questionnaire_commence', title: 'Questionnaire commencé — Pizzeria Bella (fictif)', body: 'Commencé par le client', created_at: day(-6), read_at: null },
    { id: 'n3', project_id: 'pj4', kind: 'commentaire', title: 'Nouveau commentaire — Atelier Couture (fictif)', body: 'La cliente souhaite ajouter une page « Retouches express ».', created_at: day(-4), read_at: day(-3) },
  ];
  return base.map((n) => ({ ...n, user_id: uid, link: `/projets/${n.project_id}`, email_status: 'non_envoye' as const }));
}

/** Portail client de démonstration : /projet/demo */
export function demoPortal(): PortalData {
  const q = DEMO_QUESTIONNAIRES.find((x) => x.project_id === 'pj1')!;
  return {
    project: { title: 'Site internet — Pizzeria Bella (fictif)', company_name: 'Pizzeria Bella (fictif)', status: 'en_attente_infos' },
    questionnaire: { status: 'non_commence', answers: q.answers, current_step: 0, completion_pct: q.completion_pct, submitted_at: null, last_saved_at: null },
    files: [], missing_message: null, planning_monthly_cents: 2000, privacy_policy_url: null, contact_email: 'contact@demo.fictif',
  };
}
