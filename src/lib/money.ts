const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const eurRound = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

/** Centimes → « 29,00 € » (ou « 29 € » si compact et entier) */
export function formatEuros(cents: number | null | undefined, compact = false): string {
  const v = Number(cents ?? 0) / 100;
  return compact && Number.isInteger(v) ? eurRound.format(v) : eur.format(v);
}

/** « 29,90 », « 29.9 », « 1 200 » → centimes entiers ; null si invalide */
export function parseEuros(input: string): number | null {
  const s = input.replace(/[\s €]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [int, dec = ''] = s.split('.');
  return Number(int) * 100 + Number(dec.padEnd(2, '0'));
}

/** Centimes → « 29,90 » pour un champ de saisie */
export function centsToInput(cents: number | null | undefined): string {
  const v = Number(cents ?? 0);
  return v % 100 === 0 ? String(v / 100) : (v / 100).toFixed(2).replace('.', ',');
}

/** Points de base → « 25 % » */
export function formatBps(bps: number): string {
  return `${(bps / 100).toLocaleString('fr-FR')} %`;
}
