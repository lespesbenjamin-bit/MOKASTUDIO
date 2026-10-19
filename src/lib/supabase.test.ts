import { describe, expect, it } from 'vitest';
import { humanizeError } from './supabase';

describe('humanizeError', () => {
  it('traduit les erreurs d\'authentification', () => {
    expect(humanizeError(new Error('Invalid login credentials'))).toBe('Email ou mot de passe incorrect.');
    expect(humanizeError({ message: 'User is banned' })).toMatch(/désactivé/);
  });
  it('traduit les refus de la base', () => {
    expect(humanizeError({ message: 'new row violates row-level security policy for table "leads"' })).toMatch(/droits/);
    expect(humanizeError({ message: 'Modification non autorisée pour votre rôle sur contracts' })).toMatch(/droits/);
  });
  it('garde les messages métier tels quels', () => {
    expect(humanizeError(new Error('Un compte existe déjà avec cet email'))).toBe('Un compte existe déjà avec cet email');
  });
});

import { normalizeSupabaseUrl } from './supabase';
describe('normalizeSupabaseUrl', () => {
  it('retire chemins, slash final, espaces et guillemets', () => {
    expect(normalizeSupabaseUrl('https://abc.supabase.co/rest/v1/')).toBe('https://abc.supabase.co');
    expect(normalizeSupabaseUrl(' https://abc.supabase.co/ ')).toBe('https://abc.supabase.co');
    expect(normalizeSupabaseUrl('"https://abc.supabase.co"')).toBe('https://abc.supabase.co');
    expect(normalizeSupabaseUrl('pas une url')).toBeUndefined();
  });
});
