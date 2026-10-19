// Définition du questionnaire « Projet client » : étapes, champs, options,
// règles d'affichage, complétude et informations manquantes.
// Source unique utilisée par le portail client, la saisie interne et le brief.

export type Answers = Record<string, string | string[] | boolean | number | null | undefined>;

export type Option = { value: string; label: string; hint?: string };

export type FieldType = 'text' | 'textarea' | 'email' | 'tel' | 'url' | 'select' | 'radio' | 'checkboxes' | 'ambiances';

export type Field = {
  key: string;
  label: string;
  type: FieldType;
  options?: Option[];
  help?: string;
  placeholder?: string;
  /** Champ affiché seulement si la condition est vraie */
  showIf?: (a: Answers) => boolean;
  /** Compte dans la complétude et la liste des informations manquantes */
  important?: boolean;
  /** Largeur : moitié de ligne sur ordinateur */
  half?: boolean;
  rows?: number;
};

export type Step = { id: string; title: string; short: string; intro: string; fields: Field[] };

export const SECTORS: Option[] = [
  { value: 'institut_beaute', label: 'Institut de beauté' },
  { value: 'coiffure', label: 'Salon de coiffure' },
  { value: 'artisan', label: 'Artisan' },
  { value: 'commerce', label: 'Commerce' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'coach_sportif', label: 'Coach sportif' },
  { value: 'profession_liberale', label: 'Profession libérale' },
  { value: 'hebergement', label: 'Hébergement touristique' },
  { value: 'autre', label: 'Autre' },
];

export const OBJECTIVES: Option[] = [
  { value: 'presenter', label: 'Présenter mon activité' },
  { value: 'visibilite', label: 'Développer ma visibilité' },
  { value: 'contact', label: 'Recevoir des demandes de contact' },
  { value: 'prestations_tarifs', label: 'Présenter mes prestations et tarifs' },
  { value: 'reservation', label: 'Permettre la réservation en ligne' },
  { value: 'realisations', label: 'Mettre en avant mes réalisations' },
  { value: 'equipe', label: 'Présenter mon équipe' },
  { value: 'autre', label: 'Autre' },
];

export const PAGES: Option[] = [
  { value: 'accueil', label: 'Accueil' },
  { value: 'a_propos', label: 'À propos' },
  { value: 'prestations', label: 'Prestations / Services' },
  { value: 'tarifs', label: 'Tarifs' },
  { value: 'galerie', label: 'Galerie' },
  { value: 'realisations', label: 'Réalisations' },
  { value: 'contact', label: 'Contact' },
  { value: 'reservation', label: 'Réservation' },
  { value: 'faq', label: 'FAQ' },
  { value: 'autres', label: 'Autres' },
];

export const AMBIANCES: (Option & { colors: string[]; font: string })[] = [
  { value: 'elegant', label: 'Élégant et premium', hint: 'Raffiné, épuré, haut de gamme', colors: ['#1F1B18', '#C8A97E', '#F5EFE6'], font: 'Fraunces, Georgia, serif' },
  { value: 'minimaliste', label: 'Moderne et minimaliste', hint: 'Lignes nettes, beaucoup d’espace', colors: ['#111111', '#E5E5E5', '#FFFFFF'], font: 'Inter, sans-serif' },
  { value: 'naturel', label: 'Naturel et chaleureux', hint: 'Matières, tons doux, convivial', colors: ['#6B7B4B', '#D9C3A5', '#F7F1E8'], font: 'Fraunces, Georgia, serif' },
  { value: 'dynamique', label: 'Dynamique et sportif', hint: 'Énergie, contrastes, mouvement', colors: ['#0F2A4A', '#F25C2A', '#F4F6F8'], font: 'Inter, sans-serif' },
  { value: 'professionnel', label: 'Professionnel et institutionnel', hint: 'Sérieux, rassurant, structuré', colors: ['#1E3A5F', '#8AA1B9', '#F3F5F8'], font: 'Inter, sans-serif' },
  { value: 'creatif', label: 'Créatif et original', hint: 'Audacieux, coloré, singulier', colors: ['#7A2E8E', '#F2C14E', '#FFF8EC'], font: 'Fraunces, Georgia, serif' },
];

export const FEATURES: Option[] = [
  { value: 'formulaire_contact', label: 'Formulaire de contact' },
  { value: 'appel', label: 'Bouton d’appel téléphonique' },
  { value: 'whatsapp', label: 'Lien WhatsApp' },
  { value: 'reseaux', label: 'Liens vers les réseaux sociaux' },
  { value: 'galerie', label: 'Galerie photos' },
  { value: 'google_maps', label: 'Carte Google Maps' },
  { value: 'reservation', label: 'Réservation en ligne' },
  { value: 'plateforme_externe', label: 'Lien vers une plateforme externe' },
  { value: 'tarifs', label: 'Présentation des tarifs' },
  { value: 'faq', label: 'FAQ' },
];

export const YES_NO: Option[] = [{ value: 'oui', label: 'Oui' }, { value: 'non', label: 'Non' }];

export const BOOKING_INTEGRATION: Option[] = [
  { value: 'lien', label: 'Un simple lien vers la plateforme' },
  { value: 'bouton', label: 'Un bouton « Réserver » bien visible' },
  { value: 'integre', label: 'Le module affiché dans le site' },
  { value: 'ne_sait_pas', label: 'Je ne sais pas, conseillez-moi' },
];

export const FILE_CATEGORIES: { value: string; label: string; help: string }[] = [
  { value: 'logo', label: 'Logo', help: 'Idéalement en PNG sur fond transparent, ou en PDF.' },
  { value: 'photos_etablissement', label: 'Photos de l’établissement', help: 'Façade, intérieur, ambiance.' },
  { value: 'photos_prestations', label: 'Photos des prestations', help: 'Vos soins, produits, plats, séances…' },
  { value: 'photos_realisations', label: 'Photos des réalisations', help: 'Avant / après, chantiers, créations.' },
  { value: 'portraits_equipe', label: 'Portraits de l’équipe', help: 'Une photo par personne si possible.' },
  { value: 'plaquette_tarifaire', label: 'Plaquette tarifaire', help: 'PDF ou photo de vos tarifs.' },
  { value: 'carte_prestations', label: 'Carte des prestations', help: 'Menu, carte de soins, catalogue.' },
  { value: 'autres', label: 'Documents complémentaires', help: 'Tout ce qui peut nous aider.' },
];

export const ACCEPTED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

const has = (a: Answers, k: string, v: string) => {
  const x = a[k];
  return Array.isArray(x) ? x.includes(v) : x === v;
};

export const STEPS: Step[] = [
  {
    id: 'entreprise',
    title: 'Votre entreprise',
    short: 'Entreprise',
    intro: 'Les informations qui apparaîtront sur votre site. Nous en avons déjà prérempli certaines : vérifiez-les.',
    fields: [
      { key: 'nom_commercial', label: 'Nom commercial', type: 'text', important: true, half: true },
      { key: 'raison_sociale', label: 'Raison sociale (si différente)', type: 'text', half: true },
      { key: 'secteur', label: 'Secteur d’activité', type: 'select', options: SECTORS, important: true, half: true },
      { key: 'secteur_autre', label: 'Précisez votre secteur', type: 'text', important: true, half: true, showIf: (a) => a.secteur === 'autre' },
      { key: 'adresse', label: 'Adresse professionnelle', type: 'text', placeholder: 'Numéro et rue' },
      { key: 'code_postal', label: 'Code postal', type: 'text', half: true },
      { key: 'ville', label: 'Ville', type: 'text', important: true, half: true },
      { key: 'telephone', label: 'Téléphone à afficher sur le site', type: 'tel', important: true, half: true },
      { key: 'email_public', label: 'Email public', type: 'email', important: true, half: true, help: 'L’adresse visible par vos clients sur le site.' },
      { key: 'horaires', label: 'Horaires d’ouverture', type: 'textarea', rows: 3, placeholder: 'Ex. Mardi au samedi : 9h – 19h', important: true },
      { key: 'instagram', label: 'Instagram', type: 'text', half: true, placeholder: '@votrecompte' },
      { key: 'facebook', label: 'Facebook', type: 'text', half: true, placeholder: 'Lien de votre page' },
      { key: 'autres_reseaux', label: 'Autres réseaux sociaux', type: 'text', placeholder: 'TikTok, LinkedIn, Google…' },
      { key: 'description_activite', label: 'Décrivez votre activité', type: 'textarea', rows: 4, important: true,
        help: 'En quelques phrases, comme vous la présenteriez à un nouveau client.' },
      { key: 'zone_geographique', label: 'Zone géographique desservie', type: 'text', placeholder: 'Ex. Toulouse et 20 km alentour', important: true },
    ],
  },
  {
    id: 'site',
    title: 'Votre futur site internet',
    short: 'Site',
    intro: 'Ce que votre site doit accomplir. Ces choix nous aident à préparer le projet ; ils ne modifient pas votre contrat.',
    fields: [
      { key: 'site_existant', label: 'Possédez-vous déjà un site internet ?', type: 'radio', options: YES_NO, important: true },
      { key: 'site_url', label: 'Adresse de votre site actuel', type: 'url', placeholder: 'https://', important: true, showIf: (a) => a.site_existant === 'oui' },
      { key: 'objectifs', label: 'Objectifs principaux du nouveau site', type: 'checkboxes', options: OBJECTIVES, important: true, help: 'Plusieurs choix possibles.' },
      { key: 'objectifs_autre', label: 'Autre objectif', type: 'text', showIf: (a) => has(a, 'objectifs', 'autre') },
      { key: 'clientele_cible', label: 'À qui s’adresse votre activité ?', type: 'textarea', rows: 3, important: true,
        help: 'Votre clientèle type : âge, attentes, situation…' },
      { key: 'pages', label: 'Pages souhaitées', type: 'checkboxes', options: PAGES, important: true },
      { key: 'pages_autres', label: 'Autres pages', type: 'text', showIf: (a) => has(a, 'pages', 'autres') },
      { key: 'pages_precisions', label: 'Précisions sur les pages', type: 'textarea', rows: 3 },
    ],
  },
  {
    id: 'identite',
    title: 'Identité visuelle',
    short: 'Identité',
    intro: 'L’univers graphique de votre marque. Aucune réponse n’est engageante : nous en discuterons ensemble.',
    fields: [
      { key: 'logo_existant', label: 'Avez-vous déjà un logo ?', type: 'radio', options: YES_NO, important: true,
        help: 'Si oui, vous pourrez l’envoyer à l’étape « Contenus ».' },
      { key: 'couleurs_principales', label: 'Couleurs principales', type: 'text', half: true, placeholder: 'Ex. vert sauge, doré' },
      { key: 'couleurs_secondaires', label: 'Couleurs secondaires', type: 'text', half: true },
      { key: 'ambiances', label: 'Ambiances souhaitées', type: 'ambiances', options: AMBIANCES, important: true, help: 'Sélectionnez une ou plusieurs inspirations.' },
      { key: 'typographie', label: 'Typographie souhaitée (si connue)', type: 'text' },
      { key: 'sites_apprecies', label: 'Sites internet que vous appréciez', type: 'textarea', rows: 3, placeholder: 'Collez les liens et dites ce qui vous plaît.' },
      { key: 'a_eviter', label: 'Éléments visuels à éviter', type: 'textarea', rows: 2 },
      { key: 'identite_commentaire', label: 'Commentaire libre', type: 'textarea', rows: 3 },
    ],
  },
  {
    id: 'contenus',
    title: 'Contenus et documents',
    short: 'Contenus',
    intro: 'Vos textes, photos et documents. Rien n’est obligatoire maintenant : vous pourrez compléter plus tard.',
    fields: [
      { key: 'presentation', label: 'Présentation de l’entreprise', type: 'textarea', rows: 4, important: true },
      { key: 'historique', label: 'Historique de l’activité', type: 'textarea', rows: 3, placeholder: 'Création, parcours, étapes clés…' },
      { key: 'prestations', label: 'Prestations proposées', type: 'textarea', rows: 5, important: true, help: 'Une prestation par ligne, avec une courte description si possible.' },
      { key: 'tarifs', label: 'Tarifs', type: 'textarea', rows: 4, important: true, help: 'Vous pouvez aussi envoyer votre plaquette tarifaire ci-dessous.' },
      { key: 'points_forts', label: 'Vos points forts', type: 'textarea', rows: 3, placeholder: 'Ce qui vous distingue de vos concurrents' },
      { key: 'temoignages', label: 'Témoignages clients', type: 'textarea', rows: 3, help: 'Uniquement des avis réels, avec l’accord des clients.' },
      { key: 'infos_complementaires', label: 'Informations complémentaires', type: 'textarea', rows: 3 },
    ],
  },
  {
    id: 'fonctionnalites',
    title: 'Fonctionnalités',
    short: 'Fonctions',
    intro: 'Les outils utiles à vos clients. Toute fonctionnalité hors du périmètre initial sera validée avec vous avant d’être ajoutée.',
    fields: [
      { key: 'fonctionnalites', label: 'Fonctionnalités souhaitées', type: 'checkboxes', options: FEATURES, important: true },
      { key: 'reservation_logiciel', label: 'Utilisez-vous déjà un logiciel de réservation ?', type: 'radio', options: YES_NO, important: true,
        showIf: (a) => has(a, 'fonctionnalites', 'reservation') },
      { key: 'reservation_logiciel_nom', label: 'Nom du logiciel', type: 'text', half: true, important: true, placeholder: 'Planity, Treatwell, Calendly…',
        showIf: (a) => has(a, 'fonctionnalites', 'reservation') && a.reservation_logiciel === 'oui' },
      { key: 'reservation_url', label: 'Lien de réservation', type: 'url', half: true, important: true, placeholder: 'https://',
        showIf: (a) => has(a, 'fonctionnalites', 'reservation') && a.reservation_logiciel === 'oui' },
      { key: 'reservation_integration', label: 'Type d’intégration souhaité', type: 'radio', options: BOOKING_INTEGRATION,
        showIf: (a) => has(a, 'fonctionnalites', 'reservation') && a.reservation_logiciel === 'oui' },
      { key: 'plateforme_externe_url', label: 'Lien de la plateforme externe', type: 'url', placeholder: 'https://',
        showIf: (a) => has(a, 'fonctionnalites', 'plateforme_externe') },
      { key: 'fonctionnalites_precisions', label: 'Précisions', type: 'textarea', rows: 3 },
    ],
  },
  {
    id: 'recap',
    title: 'Récapitulatif',
    short: 'Validation',
    intro: 'Vérifiez vos informations avant de les transmettre à Moka Studio.',
    fields: [],
  },
];

export type FileLike = { category: string };

/** Afficher le message sur l'option planning (réservation sans logiciel existant) */
export const showPlanningInfo = (a: Answers) => has(a, 'fonctionnalites', 'reservation') && a.reservation_logiciel === 'non';

export function isFilled(v: Answers[string]): boolean {
  if (v === null || v === undefined) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'string') return v.trim().length > 0;
  return true;
}

export const visibleFields = (step: Step, a: Answers) => step.fields.filter((f) => !f.showIf || f.showIf(a));

export type Missing = { step: string; stepTitle: string; key: string; label: string };

/** Informations importantes non renseignées (champs + documents attendus). */
export function missingInfo(a: Answers, files: FileLike[]): Missing[] {
  const out: Missing[] = [];
  for (const s of STEPS) {
    for (const f of visibleFields(s, a)) {
      if (f.important && !isFilled(a[f.key])) out.push({ step: s.id, stepTitle: s.title, key: f.key, label: f.label });
    }
  }
  const cats = new Set(files.map((f) => f.category));
  if (a.logo_existant === 'oui' && !cats.has('logo')) {
    out.push({ step: 'contenus', stepTitle: 'Contenus et documents', key: 'file:logo', label: 'Fichier du logo' });
  }
  if (!['photos_etablissement', 'photos_prestations', 'photos_realisations', 'portraits_equipe'].some((c) => cats.has(c))) {
    out.push({ step: 'contenus', stepTitle: 'Contenus et documents', key: 'file:photos', label: 'Photos (établissement, prestations ou réalisations)' });
  }
  return out;
}

/** Complétude (%) : part des informations importantes renseignées. */
export function completion(a: Answers, files: FileLike[]): number {
  let total = 0;
  for (const s of STEPS) total += visibleFields(s, a).filter((f) => f.important).length;
  total += 1 + (a.logo_existant === 'oui' ? 1 : 0); // photos (+ logo)
  const missing = missingInfo(a, files).length;
  return total ? Math.round(((total - missing) / total) * 100) : 0;
}

/** Contrôles de format (non bloquants : le client peut finir plus tard). */
export function formatError(f: Field, v: Answers[string]): string | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  const s = v.trim();
  if (f.type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) return 'Adresse email à vérifier';
  if (f.type === 'url' && !/^(https?:\/\/)?[^\s.]+\.[^\s]{2,}/i.test(s)) return 'Adresse internet à vérifier';
  if (f.type === 'tel' && s.replace(/\D/g, '').length < 9) return 'Numéro à vérifier';
  if (f.key === 'code_postal' && !/^\d{5}$/.test(s)) return 'Code postal à 5 chiffres';
  return null;
}

export function optionLabel(options: Option[] | undefined, v: string): string {
  return options?.find((o) => o.value === v)?.label ?? v;
}

/** Valeur lisible d'une réponse (récapitulatif, fiche, brief). */
export function displayValue(f: Field, v: Answers[string]): string {
  if (!isFilled(v)) return '';
  if (Array.isArray(v)) return v.map((x) => optionLabel(f.options, x)).join(', ');
  if (typeof v === 'string' && f.options) return optionLabel(f.options, v);
  return String(v);
}

export const ALL_FIELDS: Field[] = STEPS.flatMap((s) => s.fields);
export const fieldByKey = (k: string) => ALL_FIELDS.find((f) => f.key === k);
