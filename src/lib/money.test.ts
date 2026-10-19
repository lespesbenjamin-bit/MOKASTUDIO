import { describe, expect, it } from 'vitest';
import { centsToInput, formatEuros, parseEuros } from './money';

describe('argent en centimes', () => {
  it('saisie française → centimes, sans flottants', () => {
    expect(parseEuros('29,90')).toBe(2990);
    expect(parseEuros('0,1')).toBe(10);
    expect(parseEuros('1 200 €')).toBe(120000);
    expect(parseEuros('19.99')).toBe(1999);
    expect(parseEuros('12,345')).toBeNull();
    expect(parseEuros('-5')).toBeNull();
  });
  it('affichage', () => {
    expect(formatEuros(2900).replace(/\s/g, ' ')).toBe('29,00 €');
    expect(formatEuros(50000, true).replace(/\s/g, ' ')).toBe('500 €');
    expect(centsToInput(2990)).toBe('29,90');
    expect(centsToInput(3900)).toBe('39');
  });
});
