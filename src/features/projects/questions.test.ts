import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import {
  ALL_FIELDS, FILE_CATEGORIES, STEPS, completion, displayValue, fieldByKey, formatError, missingInfo, showPlanningInfo,
  type Answers,
} from './questions';

describe('définition du questionnaire', () => {
  it('6 étapes, dernière = récapitulatif', () => {
    expect(STEPS).toHaveLength(6);
    expect(STEPS[5]!.id).toBe('recap');
  });

  it('clés uniques et acceptées par le contrôle serveur', () => {
    const keys = ALL_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k).toMatch(/^[a-z][a-z0-9_]{0,39}$/);
  });

  it('les clés préremplies par la base existent dans le questionnaire', () => {
    const sql = readFileSync('supabase/migrations/20261019001500_projects.sql', 'utf8');
    const block = sql.slice(sql.indexOf('jsonb_strip_nulls(jsonb_build_object('), sql.indexOf("'site_url', r.website"));
    const prefill = [...block.matchAll(/'([a-z_]+)',/g)].map((m) => m[1]!);
    expect(prefill.length).toBeGreaterThan(8);
    for (const k of prefill) expect(fieldByKey(k), k).toBeDefined();
  });

  it('catégories de fichiers identiques à la base', () => {
    const sql = readFileSync('supabase/migrations/20261019001500_projects.sql', 'utf8');
    for (const c of FILE_CATEGORIES) expect(sql).toContain(`'${c.value}'`);
  });
});

describe('champs conditionnels, complétude, manques', () => {
  const full: Answers = {
    nom_commercial: 'Salon Léa', secteur: 'institut_beaute', ville: 'Toulouse', telephone: '0611223344',
    email_public: 'lea@x.fr', horaires: '9h-19h', description_activite: 'Soins', zone_geographique: 'Toulouse',
    site_existant: 'non', objectifs: ['visibilite'], clientele_cible: 'Femmes 25-55', pages: ['accueil'],
    logo_existant: 'non', ambiances: ['elegant'], presentation: 'x', prestations: 'x', tarifs: 'x',
    fonctionnalites: ['formulaire_contact'],
  };

  it('questionnaire complet + photos = 100 %', () => {
    expect(missingInfo(full, [{ category: 'photos_prestations' }])).toEqual([]);
    expect(completion(full, [{ category: 'photos_prestations' }])).toBe(100);
  });

  it('vide = 0 %, tout est listé comme manquant', () => {
    expect(completion({}, [])).toBe(0);
    expect(missingInfo({}, []).length).toBeGreaterThan(10);
  });

  it('« Autre » secteur → précision demandée', () => {
    const m = missingInfo({ ...full, secteur: 'autre' }, [{ category: 'photos_etablissement' }]);
    expect(m.map((x) => x.key)).toEqual(['secteur_autre']);
  });

  it('site existant → adresse demandée', () => {
    expect(missingInfo({ ...full, site_existant: 'oui' }, [{ category: 'logo' }, { category: 'photos_prestations' }]).map((x) => x.key)).toEqual(['site_url']);
  });

  it('logo annoncé → fichier du logo attendu', () => {
    expect(missingInfo({ ...full, logo_existant: 'oui' }, [{ category: 'photos_prestations' }]).map((x) => x.key)).toEqual(['file:logo']);
    expect(missingInfo({ ...full, logo_existant: 'oui' }, [{ category: 'photos_prestations' }, { category: 'logo' }])).toEqual([]);
  });

  it('réservation : logiciel existant → nom et lien demandés', () => {
    const a = { ...full, fonctionnalites: ['reservation'], reservation_logiciel: 'oui' };
    expect(missingInfo(a, [{ category: 'photos_prestations' }]).map((x) => x.key)).toEqual(['reservation_logiciel_nom', 'reservation_url']);
    expect(showPlanningInfo(a)).toBe(false);
    expect(showPlanningInfo({ ...a, reservation_logiciel: 'non' })).toBe(true);
  });

  it('valeurs lisibles et contrôles de format', () => {
    expect(displayValue(fieldByKey('pages')!, ['accueil', 'tarifs'])).toBe('Accueil, Tarifs');
    expect(displayValue(fieldByKey('secteur')!, 'coiffure')).toBe('Salon de coiffure');
    expect(formatError(fieldByKey('email_public')!, 'abc')).not.toBeNull();
    expect(formatError(fieldByKey('email_public')!, 'a@b.fr')).toBeNull();
    expect(formatError(fieldByKey('code_postal')!, '3100')).not.toBeNull();
    expect(formatError(fieldByKey('site_url')!, 'salon-lea.fr')).toBeNull();
    expect(formatError(fieldByKey('telephone')!, '06')).not.toBeNull();
  });
});

// Le contrôle du type réel des fichiers est exécuté dans la fonction serveur :
// on teste exactement son code, extrait du fichier de la fonction.
describe('fonction serveur : contrôle du vrai type des fichiers', () => {
  const src = readFileSync('supabase/functions/project-files/index.ts', 'utf8');
  const code = src.slice(src.indexOf('// <sniff>'), src.indexOf('// </sniff>')).replace('export function', 'function');
  const js = ts.transpileModule(`${code}\nreturn sniffMime;`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  const sniff = new Function(js)() as (b: Uint8Array) => string | null;
  const bytes = (...x: number[]) => new Uint8Array(x);
  const text = (s: string) => new TextEncoder().encode(s);

  it('reconnaît JPG, PNG, WEBP, PDF', () => {
    expect(sniff(bytes(0xff, 0xd8, 0xff, 0xe0, 0))).toBe('image/jpeg');
    expect(sniff(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe('image/png');
    expect(sniff(text('RIFF\u0000\u0000\u0000\u0000WEBPVP8 '))).toBe('image/webp');
    expect(sniff(text('%PDF-1.7\n'))).toBe('application/pdf');
  });

  it('refuse un exécutable, un HTML ou un SVG déguisés', () => {
    expect(sniff(text('MZ\u0090\u0000'))).toBeNull();
    expect(sniff(text('<html><script>alert(1)</script>'))).toBeNull();
    expect(sniff(text('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniff(new Uint8Array())).toBeNull();
  });
});
