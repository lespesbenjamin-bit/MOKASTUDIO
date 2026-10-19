// Logique d'import pure (sans React ni réseau) : testable unitairement.
import Papa from 'papaparse';

export type FieldKey =
  | 'name' | 'siren' | 'sector' | 'address' | 'postal_code' | 'city' | 'website'
  | 'first_name' | 'last_name' | 'full_name' | 'job_title' | 'email' | 'phone' | 'notes';

export const FIELDS: { key: FieldKey; label: string; synonyms: string[] }[] = [
  { key: 'name', label: 'Nom de l’entreprise *', synonyms: ['entreprise', 'societe', 'raison sociale', 'nom entreprise', 'nom de l entreprise', 'enseigne', 'company', 'nom commercial', 'denomination', 'etablissement', 'commerce', 'nom'] },
  { key: 'siren', label: 'SIREN', synonyms: ['siren', 'siret', 'n siren', 'numero siren'] },
  { key: 'sector', label: 'Secteur d’activité', synonyms: ['secteur', 'activite', 'secteur d activite', 'categorie', 'metier', 'naf', 'libelle naf', 'industry'] },
  { key: 'address', label: 'Adresse', synonyms: ['adresse', 'rue', 'adresse postale', 'address', 'voie'] },
  { key: 'postal_code', label: 'Code postal', synonyms: ['code postal', 'cp', 'postal', 'zip'] },
  { key: 'city', label: 'Ville', synonyms: ['ville', 'commune', 'localite', 'city'] },
  { key: 'website', label: 'Site internet', synonyms: ['site', 'site web', 'site internet', 'url', 'web', 'website', 'internet'] },
  { key: 'first_name', label: 'Prénom du contact', synonyms: ['prenom', 'first name', 'prenom contact', 'firstname'] },
  { key: 'last_name', label: 'Nom du contact', synonyms: ['nom contact', 'nom du contact', 'last name', 'nom de famille', 'lastname', 'nom dirigeant'] },
  { key: 'full_name', label: 'Contact (prénom + nom)', synonyms: ['contact', 'interlocuteur', 'dirigeant', 'gerant', 'nom complet', 'personne'] },
  { key: 'job_title', label: 'Fonction', synonyms: ['fonction', 'poste', 'titre', 'job title', 'role'] },
  { key: 'email', label: 'Email', synonyms: ['email', 'e mail', 'mail', 'courriel', 'adresse mail', 'adresse email'] },
  { key: 'phone', label: 'Téléphone', synonyms: ['telephone', 'tel', 'portable', 'mobile', 'phone', 'numero', 'tel fixe', 'tel portable', 'gsm'] },
  { key: 'notes', label: 'Notes', synonyms: ['notes', 'note', 'commentaire', 'commentaires', 'remarque', 'remarques', 'observations'] },
];

export const MAX_ROWS = 2000;

export type Cell = string | number | boolean | Date | null | undefined;
export type Table = { headers: string[]; rows: Cell[][] };
export type Mapping = (FieldKey | '')[];

export type PreparedRow = {
  line: number; // numéro de ligne dans le fichier (en-tête = 1)
  company: Record<string, string | null>;
  contact: Record<string, string | null>;
  notes: string | null;
  warnings: string[];
  error?: string;
  duplicateOf?: number; // ligne du fichier déjà importée avec la même clé
};

// --- Normalisation ------------------------------------------------------------
export function normalizeHeader(h: string): string {
  return h.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function cellToString(v: Cell): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
  return String(v).replace(/ /g, ' ').trim();
}

/** Devine la colonne de chaque champ ; chaque champ n'est attribué qu'une fois. */
export function guessMapping(headers: string[]): Mapping {
  const mapping: Mapping = headers.map(() => '');
  const used = new Set<FieldKey>();
  const norm = headers.map(normalizeHeader);
  // « Nom » à côté de « Prénom » désigne le contact, pas l'entreprise
  if (norm.includes('prenom')) {
    norm.forEach((h, i) => {
      if (h === 'nom' && !used.has('last_name')) { mapping[i] = 'last_name'; used.add('last_name'); }
    });
  }
  // 1er passage : correspondances exactes ; 2e : en-tête contenant un synonyme
  for (const exact of [true, false]) {
    norm.forEach((h, i) => {
      if (mapping[i] || !h) return;
      for (const f of FIELDS) {
        if (used.has(f.key)) continue;
        const hit = f.synonyms.some((s) => (exact ? h === s : s.length > 3 && (h.startsWith(`${s} `) || h.endsWith(` ${s}`) || h.includes(` ${s} `))));
        if (hit) { mapping[i] = f.key; used.add(f.key); return; }
      }
    });
  }
  return mapping;
}

/** Téléphone français : remet le 0 perdu par Excel (612345678 → 0612345678). */
export function cleanPhone(raw: string): { value: string | null; invalid: boolean } {
  const v = raw.trim();
  if (!v) return { value: null, invalid: false };
  const digits = v.replace(/\D/g, '');
  if (/^[1-9]\d{8}$/.test(digits) && !v.startsWith('+')) return { value: `0${digits}`, invalid: false };
  if (digits.length < 9 || digits.length > 15) return { value: null, invalid: true };
  return { value: v, invalid: false };
}

/** Code postal : remet le 0 initial perdu par Excel (1000 → 01000). */
export function cleanPostal(raw: string): { value: string | null; invalid: boolean } {
  const v = raw.replace(/\s/g, '');
  if (!v) return { value: null, invalid: false };
  if (/^\d{4}$/.test(v)) return { value: `0${v}`, invalid: false };
  if (/^\d{5}$/.test(v)) return { value: v, invalid: false };
  return { value: null, invalid: true };
}

/** SIREN : accepte un SIRET (14 chiffres) et garde les 9 premiers. */
export function cleanSiren(raw: string): { value: string | null; invalid: boolean } {
  const d = raw.replace(/[\s.]/g, '');
  if (!d) return { value: null, invalid: false };
  if (/^\d{9}$/.test(d)) return { value: d, invalid: false };
  if (/^\d{14}$/.test(d)) return { value: d.slice(0, 9), invalid: false };
  return { value: null, invalid: true };
}

export function cleanEmail(raw: string): { value: string | null; invalid: boolean } {
  const v = raw.trim().replace(/^mailto:/i, '');
  if (!v) return { value: null, invalid: false };
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? { value: v.toLowerCase(), invalid: false } : { value: null, invalid: true };
}

function digitsKey(phone: string | null) {
  if (!phone) return null;
  let d = phone.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 10 && d.startsWith('0')) d = `33${d.slice(1)}`;
  return d.length >= 9 ? d : null;
}

// --- Préparation des lignes ---------------------------------------------------------
export function prepareRows(table: Table, mapping: Mapping): PreparedRow[] {
  const seen = new Map<string, number>();
  const out: PreparedRow[] = [];

  table.rows.forEach((cells, idx) => {
    const line = idx + 2;
    const get = (k: FieldKey) => {
      const values = mapping.flatMap((m, i) => (m === k ? [cellToString(cells[i])] : [])).filter(Boolean);
      return values.join(' ').trim();
    };
    if (cells.every((c) => cellToString(c) === '')) return; // ligne vide

    const warnings: string[] = [];
    const phone = cleanPhone(get('phone'));
    const postal = cleanPostal(get('postal_code'));
    const siren = cleanSiren(get('siren'));
    const email = cleanEmail(get('email'));
    if (phone.invalid) warnings.push('téléphone ignoré (format)');
    if (postal.invalid) warnings.push('code postal ignoré (format)');
    if (siren.invalid) warnings.push('SIREN ignoré (format)');
    if (email.invalid) warnings.push('email ignoré (format)');

    let first = get('first_name') || null;
    let last = get('last_name') || null;
    const full = get('full_name');
    if (full && !first && !last) {
      const [f, ...rest] = full.split(/\s+/);
      first = f ?? null;
      last = rest.join(' ') || null;
    }

    const row: PreparedRow = {
      line,
      company: {
        name: get('name') || null,
        siren: siren.value,
        sector: get('sector') || null,
        address: get('address') || null,
        postal_code: postal.value,
        city: get('city') || null,
        website: get('website') || null,
      },
      contact: { first_name: first, last_name: last, job_title: get('job_title') || null, email: email.value, phone: phone.value },
      notes: get('notes') || null,
      warnings,
    };

    if (!row.company.name) row.error = 'Nom de l’entreprise manquant';
    else if ((row.company.name ?? '').length > 200) row.error = 'Nom de l’entreprise trop long';

    // Doublons à l'intérieur du fichier (la base contrôle ensuite l'existant)
    if (!row.error) {
      const keys = [
        row.company.siren && `s:${row.company.siren}`,
        row.contact.email && `e:${row.contact.email}`,
        digitsKey(row.contact.phone ?? null) && `p:${digitsKey(row.contact.phone ?? null)}`,
      ].filter(Boolean) as string[];
      const prev = keys.map((k) => seen.get(k)).find((v) => v !== undefined);
      if (prev !== undefined) row.duplicateOf = prev;
      else keys.forEach((k) => seen.set(k, line));
    }
    out.push(row);
  });
  return out;
}

// --- Lecture des fichiers ----------------------------------------------------------
/** Décode un CSV : UTF-8, sinon Windows-1252 (export Excel français). */
export function decodeText(buf: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

export function parseCsv(text: string): Table {
  const res = Papa.parse<string[]>(text.trim(), { skipEmptyLines: 'greedy', delimiter: '' });
  return toTable(res.data);
}

/** Première ligne non vide = en-têtes ; colonnes sans en-tête nommées « Colonne N ». */
export function toTable(data: Cell[][]): Table {
  const rows = data.filter((r) => r.some((c) => cellToString(c) !== ''));
  const head = rows.shift() ?? [];
  const width = Math.max(head.length, ...rows.map((r) => r.length));
  const headers = Array.from({ length: width }, (_, i) => cellToString(head[i]) || `Colonne ${i + 1}`);
  return { headers, rows };
}

// --- Fichiers générés -----------------------------------------------------------------
function csvCell(v: string | number | null | undefined) {
  const s = v == null ? '' : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV lisible par Excel FR : BOM UTF-8 + séparateur « ; » */
export function toExcelCsv(rows: (string | number | null | undefined)[][]): string {
  return `﻿${rows.map((r) => r.map(csvCell).join(';')).join('\r\n')}\r\n`;
}

export const TEMPLATE_ROWS = [
  ['Entreprise', 'SIREN', 'Secteur', 'Adresse', 'Code postal', 'Ville', 'Site internet', 'Prénom', 'Nom', 'Email', 'Téléphone', 'Notes'],
  ['Salon Exemple', '', 'Coiffure', '12 rue des Lilas', '31000', 'Toulouse', 'www.salon-exemple.fr', 'Marie', 'Durand', 'contact@salon-exemple.fr', '06 12 34 56 78', 'Vu au salon des artisans'],
];

export function download(filename: string, content: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
