// Générateur du brief de développement (prompt pour Claude), sans IA :
// modèles de texte adaptés au secteur + réponses structurées du questionnaire.
// Règle absolue : ne JAMAIS inventer de prestations, tarifs, avis ou informations
// commerciales. Ce qui manque est signalé « [À COMPLÉTER : …] » et listé.
import type { OfferCode } from '@/types/database';
import {
  AMBIANCES, BOOKING_INTEGRATION, FEATURES, FILE_CATEGORIES, OBJECTIVES, PAGES, SECTORS, missingInfo,
  optionLabel, type Answers,
} from './questions';

export type BriefInput = {
  companyName: string;
  offerCode: OfferCode | null;
  withPlanningOption: boolean | null;
  contractReference: string | null;
  targetDate: string | null;
  answers: Answers;
  files: { category: string; name: string }[];
  deliveryDays?: number;
};

type SectorGuide = { label: string; schema: string; focus: string[]; pages: string[]; tone: string; caution?: string };

export const SECTOR_GUIDES: Record<string, SectorGuide> = {
  institut_beaute: {
    label: 'institut de beauté', schema: 'BeautySalon',
    focus: [
      'Carte des soins claire et détaillée : nom du soin, durée, bienfaits, tarif — uniquement ceux fournis.',
      'Réservation en ligne très visible (bouton « Réserver » fixe sur mobile) si elle est demandée.',
      'Tarifs lisibles, regroupés par catégorie de soins.',
      'Ambiance esthétique apaisante : photos de cabine et de soins mises en valeur, beaucoup d’espace blanc.',
    ],
    pages: ['Accueil', 'Soins & tarifs', 'L’institut', 'Réservation', 'Contact'],
    tone: 'chaleureux, rassurant et raffiné',
  },
  coiffure: {
    label: 'salon de coiffure', schema: 'HairSalon',
    focus: [
      'Prestations et tarifs par catégorie (femme, homme, enfant, techniques) — uniquement ceux fournis.',
      'Réservation en ligne ou appel en un clic.',
      'Galerie de coiffures (photos fournies uniquement), mise en avant de l’équipe.',
    ],
    pages: ['Accueil', 'Prestations & tarifs', 'Galerie', 'L’équipe', 'Contact'],
    tone: 'tendance, accueillant et professionnel',
  },
  artisan: {
    label: 'artisan', schema: 'HomeAndConstructionBusiness',
    focus: [
      'Réalisations mises en avant : galerie par chantier (avant / après si les photos le permettent).',
      'Zone d’intervention explicite (communes et rayon) sur l’accueil et la page contact.',
      'Demande de devis simple : formulaire avec type de travaux, commune, description et coordonnées.',
      'Bouton d’appel visible sur mobile. Ne mentionner certifications, labels ou garanties QUE s’ils sont fournis.',
    ],
    pages: ['Accueil', 'Services', 'Réalisations', 'Zone d’intervention', 'Demande de devis'],
    tone: 'solide, concret et digne de confiance',
  },
  commerce: {
    label: 'commerce', schema: 'Store',
    focus: [
      'Univers et produits phares (uniquement ceux fournis), horaires et accès très visibles.',
      'Carte Google Maps et itinéraire, liens vers les réseaux sociaux.',
    ],
    pages: ['Accueil', 'La boutique', 'Nos produits', 'Infos pratiques', 'Contact'],
    tone: 'accueillant et vivant',
  },
  restaurant: {
    label: 'restaurant', schema: 'Restaurant',
    focus: [
      'Carte / menu lisible sur mobile (texte, pas uniquement une image) — uniquement les plats et prix fournis.',
      'Horaires d’ouverture, réservation ou appel en un clic, accès et stationnement.',
      'Photos des plats et de la salle mises en valeur.',
    ],
    pages: ['Accueil', 'La carte', 'Le lieu', 'Réserver', 'Contact'],
    tone: 'gourmand et convivial',
  },
  coach_sportif: {
    label: 'coach sportif', schema: 'SportsActivityLocation',
    focus: [
      'Offres de coaching présentées comme des formules claires (individuel, collectif, packs) — uniquement celles fournies.',
      'Planning des séances et réservation si demandés.',
      'Témoignages : uniquement ceux fournis par le client, jamais inventés.',
      'Présentation du coach (parcours, approche) pour créer la confiance.',
    ],
    pages: ['Accueil', 'Coaching & formules', 'Planning', 'À propos', 'Contact'],
    tone: 'motivant, dynamique et bienveillant',
  },
  profession_liberale: {
    label: 'profession libérale', schema: 'ProfessionalService',
    focus: [
      'Domaines d’expertise et déroulé d’un premier rendez-vous.',
      'Prise de rendez-vous ou formulaire de contact.',
    ],
    pages: ['Accueil', 'Expertises', 'Le cabinet', 'Honoraires', 'Contact'],
    tone: 'sobre, clair et professionnel',
    caution: 'Vérifier les règles déontologiques de la profession (publicité, avis clients, honoraires) avant toute publication.',
  },
  hebergement: {
    label: 'hébergement touristique', schema: 'LodgingBusiness',
    focus: [
      'Présentation des logements / chambres : capacité, équipements — uniquement ceux fournis.',
      'Galerie photo généreuse, accès, activités alentour (si fournies).',
      'Réservation via la plateforme indiquée ou formulaire de demande.',
    ],
    pages: ['Accueil', 'Hébergements', 'Galerie', 'Infos pratiques', 'Réserver'],
    tone: 'chaleureux et évasif',
  },
};
const DEFAULT_GUIDE: SectorGuide = {
  label: 'entreprise locale', schema: 'LocalBusiness',
  focus: ['Présenter clairement l’activité, les prestations et les moyens de contact.'],
  pages: ['Accueil', 'Prestations', 'À propos', 'Contact'],
  tone: 'professionnel et accessible',
};

const TODO = (what: string) => `[À COMPLÉTER : ${what}]`;
const str = (a: Answers, k: string) => (typeof a[k] === 'string' ? (a[k] as string).trim() : '');
const list = (a: Answers, k: string) => (Array.isArray(a[k]) ? (a[k] as string[]) : []);

/** Texte fourni par le client, cité tel quel (jamais réécrit comme un fait nouveau). */
function quote(text: string): string {
  return text.split(/\r?\n/).map((l) => `> ${l}`).join('\n');
}
function provided(a: Answers, k: string, what: string): string {
  const v = str(a, k);
  return v ? quote(v) : TODO(what);
}

export function generateBrief(input: BriefInput): string {
  const a = input.answers;
  const sector = str(a, 'secteur');
  const guide = SECTOR_GUIDES[sector] ?? DEFAULT_GUIDE;
  const sectorLabel = sector === 'autre' && str(a, 'secteur_autre') ? str(a, 'secteur_autre') : sector ? optionLabel(SECTORS, sector) : '';
  const name = str(a, 'nom_commercial') || input.companyName;
  const city = str(a, 'ville');
  const features = list(a, 'fonctionnalites');
  const pages = list(a, 'pages');
  const missing = missingInfo(a, input.files);
  const L: string[] = [];
  const h = (t: string) => L.push('', `## ${t}`, '');
  const li = (label: string, v: string) => L.push(`- **${label}** : ${v || TODO(label.toLowerCase())}`);

  L.push(`# Brief de développement — ${name}`, '');
  L.push(
    `Tu es un développeur web senior, spécialiste des sites vitrines pour les petites entreprises, avec un sens aigu du design, de l’UX mobile, de l’accessibilité et du référencement local. ` +
    `Tu vas concevoir et développer le site internet de **${name}**${sectorLabel ? ` (${sectorLabel.toLowerCase()}${city ? `, ${city}` : ''})` : ''} pour l’agence Moka Studio.`,
    '',
    '**Règles impératives :**',
    '- Utilise uniquement les informations de ce brief. N’invente jamais de prestations, de tarifs, d’avis clients, de chiffres, de diplômes, de labels ou de garanties.',
    '- Quand une information manque, insère un emplacement visible `[À COMPLÉTER : …]` et ajoute-le à la liste finale ; ne le remplace pas par un texte inventé.',
    '- Les textes entre guillemets (>) viennent du client : tu peux les corriger (orthographe, fluidité) et les structurer, sans en changer le sens ni ajouter de promesse.',
    '- Toute fonctionnalité non listée ici est hors périmètre : propose-la séparément, ne l’ajoute pas.',
    `- Ton éditorial : ${guide.tone}.`,
  );
  if (guide.caution) L.push(`- ${guide.caution}`);

  h('Contexte du projet');
  li('Client', name);
  if (str(a, 'raison_sociale')) li('Raison sociale', str(a, 'raison_sociale'));
  li('Offre Moka Studio', input.offerCode === 'abonnement' ? 'Abonnement (site + hébergement + maintenance)' : input.offerCode === 'vente_directe' ? 'Vente directe (site livré)' : 'Non précisée');
  li('Option planning (réservation Moka Studio)', input.withPlanningOption ? 'souscrite' : 'non souscrite');
  if (input.contractReference) li('Référence contrat', input.contractReference);
  li('Délai', `livraison prévue ${input.targetDate ? `le ${new Date(`${input.targetDate}T00:00:00`).toLocaleDateString('fr-FR')}` : `${input.deliveryDays ?? 10} jours après validation du périmètre`}`);

  h('1. Présentation de l’entreprise');
  li('Secteur', sectorLabel);
  li('Ville', city);
  li('Zone géographique desservie', str(a, 'zone_geographique'));
  L.push('', '**Description de l’activité (client) :**', provided(a, 'description_activite', 'description de l’activité'));
  if (str(a, 'historique')) L.push('', '**Historique :**', quote(str(a, 'historique')));

  h('2. Objectifs commerciaux du site');
  const objs = list(a, 'objectifs').map((o) => (o === 'autre' && str(a, 'objectifs_autre') ? str(a, 'objectifs_autre') : optionLabel(OBJECTIVES, o)));
  if (objs.length) objs.forEach((o) => L.push(`- ${o}`)); else L.push(`- ${TODO('objectifs du site')}`);
  L.push('', `Points d’attention pour un ${guide.label} :`);
  guide.focus.forEach((f) => L.push(`- ${f}`));
  if (str(a, 'site_existant') === 'oui') {
    L.push('', `Site actuel : ${str(a, 'site_url') || TODO('adresse du site actuel')} — reprendre les contenus utiles et prévoir les redirections des anciennes pages importantes.`);
  }

  h('3. Clientèle cible');
  L.push(provided(a, 'clientele_cible', 'clientèle cible'));

  h('4. Architecture des pages');
  if (pages.length) {
    pages.forEach((p) => L.push(`- ${p === 'autres' && str(a, 'pages_autres') ? str(a, 'pages_autres') : optionLabel(PAGES, p)}`));
  } else {
    L.push(`Pages non précisées par le client. Proposition à faire valider (ne pas considérer comme acquise) : ${guide.pages.join(', ')}.`);
  }
  if (str(a, 'pages_precisions')) L.push('', '**Précisions du client :**', quote(str(a, 'pages_precisions')));
  L.push('', 'Prévoir également : mentions légales, politique de confidentialité, page 404. Navigation simple (5 à 6 entrées maximum), pied de page avec coordonnées.');

  h('5. Identité visuelle');
  const hasLogoFile = input.files.some((f) => f.category === 'logo');
  li('Logo', str(a, 'logo_existant') === 'oui' ? (hasLogoFile ? 'fourni (voir documents)' : `existant mais non reçu — ${TODO('fichier du logo')}`) : str(a, 'logo_existant') === 'non' ? 'aucun logo : prévoir un logotype typographique simple, à faire valider' : '');
  li('Couleurs principales', str(a, 'couleurs_principales') || 'non précisées : proposer une palette cohérente avec l’ambiance, à faire valider');
  if (str(a, 'couleurs_secondaires')) li('Couleurs secondaires', str(a, 'couleurs_secondaires'));
  const amb = list(a, 'ambiances').map((v) => AMBIANCES.find((x) => x.value === v)).filter(Boolean);
  li('Ambiance', amb.length ? amb.map((x) => `${x!.label} (${x!.hint?.toLowerCase()})`).join(' ; ') : '');
  if (str(a, 'typographie')) li('Typographie souhaitée', str(a, 'typographie'));
  if (str(a, 'sites_apprecies')) L.push('', '**Sites appréciés par le client :**', quote(str(a, 'sites_apprecies')));
  if (str(a, 'a_eviter')) L.push('', '**À éviter :**', quote(str(a, 'a_eviter')));
  if (str(a, 'identite_commentaire')) L.push('', '**Commentaire :**', quote(str(a, 'identite_commentaire')));

  h('6. Contenus disponibles');
  L.push('**Présentation :**', provided(a, 'presentation', 'texte de présentation'));
  L.push('', '**Points forts :**', str(a, 'points_forts') ? quote(str(a, 'points_forts')) : 'Non fournis : ne pas en inventer.');
  L.push('', '**Témoignages clients :**', str(a, 'temoignages') ? quote(str(a, 'temoignages')) : 'Aucun témoignage fourni : ne pas en créer ; prévoir la section masquée tant qu’il n’y en a pas.');
  if (str(a, 'infos_complementaires')) L.push('', '**Informations complémentaires :**', quote(str(a, 'infos_complementaires')));
  L.push('', '**Documents fournis :**');
  const cats = FILE_CATEGORIES.filter((c) => input.files.some((f) => f.category === c.value));
  if (cats.length) {
    cats.forEach((c) => {
      const names = input.files.filter((f) => f.category === c.value).map((f) => f.name);
      L.push(`- ${c.label} (${names.length}) : ${names.slice(0, 12).join(', ')}${names.length > 12 ? '…' : ''}`);
    });
    L.push('', 'Optimiser toutes les images (WebP, dimensions adaptées, chargement différé) et rédiger un texte alternatif pour chacune.');
  } else {
    L.push(`- Aucun document reçu — ${TODO('photos et logo')}. Utiliser des emplacements neutres clairement identifiés, jamais de fausses photos présentées comme réelles.`);
  }

  h('7. Prestations et tarifs');
  L.push('**Prestations (client) :**', provided(a, 'prestations', 'liste des prestations'));
  L.push('', '**Tarifs (client) :**', provided(a, 'tarifs', 'tarifs'));
  if (input.files.some((f) => f.category === 'plaquette_tarifaire' || f.category === 'carte_prestations')) {
    L.push('', 'Une plaquette / carte est jointe dans les documents : en reprendre fidèlement le contenu (aucun prix ajouté ni arrondi).');
  }

  h('8. Fonctionnalités');
  if (features.length) features.forEach((f) => L.push(`- ${optionLabel(FEATURES, f)}`));
  else L.push(`- ${TODO('fonctionnalités souhaitées')} — par défaut : formulaire de contact et bouton d’appel.`);
  if (features.includes('reservation')) {
    if (str(a, 'reservation_logiciel') === 'oui') {
      L.push('', `Réservation via le logiciel existant : ${str(a, 'reservation_logiciel_nom') || TODO('nom du logiciel')}, lien ${str(a, 'reservation_url') || TODO('lien de réservation')}.`);
      if (str(a, 'reservation_integration')) L.push(`Intégration souhaitée : ${optionLabel(BOOKING_INTEGRATION, str(a, 'reservation_integration'))}.`);
    } else if (input.withPlanningOption) {
      L.push('', 'Réservation : option planning Moka Studio souscrite — intégrer le module de prise de rendez-vous Moka Studio.');
    } else {
      L.push('', 'Réservation demandée sans logiciel existant et option planning Moka Studio NON souscrite : ne pas intégrer de module de réservation sans validation commerciale ; prévoir un emplacement et un bouton de contact en attendant.');
    }
  }
  if (features.includes('plateforme_externe')) L.push(`Plateforme externe : ${str(a, 'plateforme_externe_url') || TODO('lien de la plateforme externe')}.`);
  if (features.includes('google_maps')) L.push('Carte : intégration Google Maps chargée après consentement (ou image statique avec lien « Itinéraire »).');
  if (str(a, 'fonctionnalites_precisions')) L.push('', '**Précisions :**', quote(str(a, 'fonctionnalites_precisions')));

  h('9. Informations de contact');
  li('Téléphone', str(a, 'telephone'));
  li('Email', str(a, 'email_public'));
  li('Adresse', [str(a, 'adresse'), str(a, 'code_postal'), city].filter(Boolean).join(' '));
  L.push(`- **Horaires** :${str(a, 'horaires') ? `\n${quote(str(a, 'horaires'))}` : ` ${TODO('horaires d’ouverture')}`}`);
  const socials = [['Instagram', 'instagram'], ['Facebook', 'facebook'], ['Autres réseaux', 'autres_reseaux']].filter(([, k]) => str(a, k!));
  if (socials.length) socials.forEach(([l, k]) => li(l!, str(a, k!)));
  else L.push('- **Réseaux sociaux** : aucun communiqué (ne pas afficher d’icônes vides).');

  h('10. Instructions techniques');
  [
    'Site vitrine rapide et léger : HTML sémantique, CSS moderne, JavaScript limité au nécessaire (ou framework statique léger).',
    'Composants réutilisables (en-tête, pied de page, cartes de prestation, appels à l’action).',
    'Formulaires : validation côté client et serveur, protection anti-spam (champ piège ou équivalent), message de confirmation, consentement RGPD.',
    'Images en WebP/AVIF avec dimensions explicites ; chargement différé hors écran ; favicon et image de partage (Open Graph).',
    'Aucun cookie ni traceur sans consentement ; pas de police ou script tiers non indispensable.',
    'Livrer un code propre, commenté, prêt à être hébergé par Moka Studio.',
  ].forEach((x) => L.push(`- ${x}`));

  h('11. Responsive et accessibilité');
  [
    'Conception mobile d’abord (360 px), puis tablette et ordinateur ; aucun défilement horizontal.',
    'Boutons d’action (appel, réservation, devis) accessibles au pouce, zones tactiles d’au moins 44 px.',
    'Contrastes conformes WCAG 2.1 AA, texte de 16 px minimum, hiérarchie de titres logique.',
    'Navigation au clavier, focus visible, textes alternatifs, libellés de formulaires explicites.',
  ].forEach((x) => L.push(`- ${x}`));

  h('12. SEO de base');
  const kw = [sectorLabel.toLowerCase(), city].filter(Boolean).join(' ');
  [
    `Balise title et meta description uniques par page, incluant l’activité et la ville${kw ? ` (ex. « ${kw} »)` : ''}.`,
    'Un seul H1 par page, URLs lisibles, maillage interne entre prestations et contact.',
    `Données structurées schema.org de type ${guide.schema} avec nom, adresse, téléphone, horaires — uniquement les informations fournies.`,
    'Sitemap XML, robots.txt, balises Open Graph, cohérence avec la fiche Google Business Profile.',
    str(a, 'zone_geographique') ? `Mettre en avant la zone desservie : ${str(a, 'zone_geographique')}.` : 'Zone desservie à confirmer avant de rédiger les contenus locaux.',
  ].forEach((x) => L.push(`- ${x}`));

  h('13. Informations manquantes');
  if (missing.length) {
    L.push('À demander au client avant ou pendant la production (laisser les emplacements [À COMPLÉTER] visibles d’ici là) :');
    missing.forEach((m) => L.push(`- ${m.label} (${m.stepTitle})`));
  } else {
    L.push('Aucune information essentielle manquante d’après le questionnaire.');
  }

  h('Livrables attendus');
  L.push(
    '1. Proposition d’arborescence et de maquette de la page d’accueil (structure + intentions visuelles).',
    '2. Code complet du site, page par page.',
    '3. Liste finale de tous les emplacements « [À COMPLÉTER] » restants.',
  );
  return L.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export function briefFileName(company: string, version?: number) {
  const slug = company.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `brief-${slug || 'projet'}${version ? `-v${version}` : ''}.md`;
}
