import { describe, expect, it } from 'vitest';
import { briefFileName, generateBrief, type BriefInput } from './brief';

const base: BriefInput = {
  companyName: 'Salon Léa', offerCode: 'abonnement', withPlanningOption: false, contractReference: 'MOKA-2026-0001',
  targetDate: '2026-11-02', files: [], answers: {},
};

const SECTIONS = [
  '1. Présentation de l’entreprise', '2. Objectifs commerciaux du site', '3. Clientèle cible', '4. Architecture des pages',
  '5. Identité visuelle', '6. Contenus disponibles', '7. Prestations et tarifs', '8. Fonctionnalités', '9. Informations de contact',
  '10. Instructions techniques', '11. Responsive et accessibilité', '12. SEO de base', '13. Informations manquantes',
];

describe('brief de développement', () => {
  it('contient l’introduction « développeur web senior » et les 13 sections', () => {
    const md = generateBrief(base);
    expect(md).toMatch(/Tu es un développeur web senior/);
    for (const s of SECTIONS) expect(md).toContain(`## ${s}`);
  });

  it('n’invente ni tarifs, ni prestations, ni avis quand ils manquent', () => {
    const md = generateBrief(base);
    expect(md).not.toMatch(/\d+\s?€/);
    expect(md).toContain('[À COMPLÉTER : tarifs]');
    expect(md).toContain('[À COMPLÉTER : liste des prestations]');
    expect(md).toMatch(/Aucun témoignage fourni : ne pas en créer/);
  });

  it('reprend fidèlement les textes du client (citations)', () => {
    const md = generateBrief({ ...base, answers: { tarifs: 'Soin visage : 45 €\nÉpilation : 15 €', temoignages: '« Super accueil » — Julie' } });
    expect(md).toContain('> Soin visage : 45 €\n> Épilation : 15 €');
    expect(md).toContain('> « Super accueil » — Julie');
  });

  it('s’adapte au secteur : institut de beauté', () => {
    const md = generateBrief({ ...base, answers: { secteur: 'institut_beaute', ville: 'Toulouse' } });
    expect(md).toMatch(/Carte des soins/);
    expect(md).toMatch(/BeautySalon/);
    expect(md).toMatch(/institut de beauté toulouse/i);
  });

  it('s’adapte au secteur : artisan (réalisations, zone, devis)', () => {
    const md = generateBrief({ ...base, answers: { secteur: 'artisan', zone_geographique: 'Muret et 30 km' } });
    expect(md).toMatch(/Réalisations mises en avant/);
    expect(md).toMatch(/Zone d’intervention/);
    expect(md).toMatch(/Demande de devis/);
    expect(md).toContain('Muret et 30 km');
  });

  it('s’adapte au secteur : coach sportif (formules, planning, témoignages)', () => {
    const md = generateBrief({ ...base, answers: { secteur: 'coach_sportif' } });
    expect(md).toMatch(/Offres de coaching/);
    expect(md).toMatch(/Planning des séances/);
    expect(md).toMatch(/Témoignages : uniquement ceux fournis/);
  });

  it('réservation sans logiciel ni option : pas de module ajouté sans validation', () => {
    const md = generateBrief({ ...base, answers: { fonctionnalites: ['reservation'], reservation_logiciel: 'non' } });
    expect(md).toMatch(/ne pas intégrer de module de réservation sans validation commerciale/);
    const withOption = generateBrief({ ...base, withPlanningOption: true, answers: { fonctionnalites: ['reservation'], reservation_logiciel: 'non' } });
    expect(withOption).toMatch(/option planning Moka Studio souscrite/);
  });

  it('liste les documents et les informations manquantes', () => {
    const md = generateBrief({ ...base, answers: { logo_existant: 'oui' }, files: [{ category: 'photos_prestations', name: 'soin.jpg' }] });
    expect(md).toContain('Photos des prestations (1) : soin.jpg');
    expect(md).toMatch(/- Fichier du logo \(Contenus et documents\)/);
  });

  it('nom de fichier Markdown', () => {
    expect(briefFileName('Salon Léa & Co', 2)).toBe('brief-salon-lea-co-v2.md');
  });
});
