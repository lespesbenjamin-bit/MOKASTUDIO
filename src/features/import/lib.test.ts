import { describe, expect, it } from 'vitest';
import { cleanPhone, cleanPostal, cleanSiren, decodeText, guessMapping, parseCsv, prepareRows, toExcelCsv } from './lib';

describe('reconnaissance des colonnes', () => {
  it('en-têtes français courants', () => {
    expect(guessMapping(['Raison sociale', 'Code Postal', 'Ville', 'Tél.', 'E-mail', 'Site web', 'Secteur d’activité'])).toEqual(
      ['name', 'postal_code', 'city', 'phone', 'email', 'website', 'sector'],
    );
  });
  it('« Nom » + « Prénom » = contact ; « Entreprise » = société', () => {
    expect(guessMapping(['Entreprise', 'Prénom', 'Nom', 'Téléphone portable'])).toEqual(['name', 'first_name', 'last_name', 'phone']);
  });
  it('« Nom » seul = entreprise', () => {
    expect(guessMapping(['Nom', 'Adresse', 'CP', 'Commune'])).toEqual(['name', 'address', 'postal_code', 'city']);
  });
  it('colonne inconnue laissée vide, un champ attribué une seule fois', () => {
    expect(guessMapping(['Entreprise', 'Avis Google', 'Téléphone', 'Mobile'])).toEqual(['name', '', 'phone', '']);
  });
});

describe('nettoyage', () => {
  it('téléphone sans 0 initial (Excel)', () => {
    expect(cleanPhone('612345678').value).toBe('0612345678');
    expect(cleanPhone('+33 6 12 34 56 78').value).toBe('+33 6 12 34 56 78');
    expect(cleanPhone('12 34').invalid).toBe(true);
  });
  it('code postal sans 0 initial', () => {
    expect(cleanPostal('1000').value).toBe('01000');
    expect(cleanPostal('31 000').value).toBe('31000');
    expect(cleanPostal('Toulouse').invalid).toBe(true);
  });
  it('SIRET → SIREN', () => {
    expect(cleanSiren('123 456 789 00012').value).toBe('123456789');
    expect(cleanSiren('1234').invalid).toBe(true);
  });
});

describe('préparation des lignes', () => {
  const table = parseCsv(
    'Entreprise;Contact;Téléphone;Email;CP\n' +
    'Salon Léa;Marie Durand;06 12 34 56 78;lea@salon.fr;31000\n' +
    ';Paul;0600000000;;\n' +
    'Salon Léa (copie);;+33 6 12 34 56 78;;\n' +
    'Garage;;123;pas-un-email;Toulouse\n' +
    ';;;;\n',
  );
  const rows = prepareRows(table, guessMapping(table.headers));
  it('détecte le séparateur « ; » et ignore les lignes vides', () => {
    expect(table.headers).toEqual(['Entreprise', 'Contact', 'Téléphone', 'Email', 'CP']);
    expect(rows).toHaveLength(4);
  });
  it('découpe le contact en prénom / nom', () => {
    expect(rows[0]!.contact.first_name).toBe('Marie');
    expect(rows[0]!.contact.last_name).toBe('Durand');
  });
  it('erreur si nom d’entreprise absent (n° de ligne du fichier)', () => {
    expect(rows[1]!.error).toMatch(/manquant/);
    expect(rows[1]!.line).toBe(3);
  });
  it('doublon interne au fichier, même téléphone écrit autrement', () => {
    expect(rows[2]!.duplicateOf).toBe(2);
  });
  it('champs invalides ignorés avec avertissement, ligne conservée', () => {
    expect(rows[3]!.error).toBeUndefined();
    expect(rows[3]!.warnings).toEqual(['téléphone ignoré (format)', 'code postal ignoré (format)', 'email ignoré (format)']);
  });
});

describe('fichiers', () => {
  it('CSV Excel en Windows-1252 (accents)', () => {
    const bytes = new Uint8Array([0x53, 0x6f, 0x63, 0x69, 0xe9, 0x74, 0xe9]); // « Société » en cp1252
    expect(decodeText(bytes.buffer)).toBe('Société');
  });
  it('CSV généré lisible par Excel FR', () => {
    expect(toExcelCsv([['a', 'b;c'], ['d"e', null]])).toBe('﻿a;"b;c"\r\n"d""e";\r\n');
  });
});
