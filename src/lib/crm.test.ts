import { describe, expect, it } from 'vitest';
import { dateInputToIso, daysFromToday, formatAgo, formatDay, isoToDateInput, normalizeSearch, telHref } from './crm';

const now = new Date(2026, 9, 19, 15, 0); // 19 oct. 2026, 15 h

describe('dates', () => {
  it('compte les jours calendaires, pas les 24 h', () => {
    expect(daysFromToday(new Date(2026, 9, 20, 8).toISOString(), now)).toBe(1);
    expect(daysFromToday(new Date(2026, 9, 18, 23).toISOString(), now)).toBe(-1);
    expect(daysFromToday(new Date(2026, 9, 19, 0, 5).toISOString(), now)).toBe(0);
  });
  it('libellés relatifs', () => {
    expect(formatDay(new Date(2026, 9, 19, 9).toISOString(), now)).toBe("Aujourd'hui");
    expect(formatDay(new Date(2026, 9, 20, 9).toISOString(), now)).toBe('Demain');
    expect(formatAgo(new Date(2026, 9, 9).toISOString(), now)).toBe('il y a 10 j');
  });
  it('champ date ↔ ISO, sans décalage de jour', () => {
    const iso = dateInputToIso('2026-10-20')!;
    expect(isoToDateInput(iso)).toBe('2026-10-20');
    expect(new Date(iso).getHours()).toBe(9);
    expect(dateInputToIso('')).toBeNull();
  });
});

describe('divers', () => {
  it('recherche sans accents ni majuscules', () => {
    expect(normalizeSearch('  Salon LÉA ')).toBe('salon lea');
  });
  it('lien téléphone', () => {
    expect(telHref('06 12 34 56 78')).toBe('tel:0612345678');
    expect(telHref('+33 (0)6 12')).toBe('tel:+330612');
  });
});
