// Fonctions pures de la carte : géocodage (Géoplateforme IGN), distances,
// ordre de tournée, liens de navigation. Testées dans geo.test.ts.
import type { GeocodePrecision, LeadStatus } from '@/types/database';

export type LatLng = { lat: number; lng: number };
export type MapStatus = LeadStatus | 'client';

// --- Couleurs des épingles ---------------------------------------------------
export const PIN_COLORS: Record<MapStatus, string> = {
  a_contacter: '#A39E95',
  contacte: '#C9B8A6',
  interesse: '#D9A68F',
  rdv_programme: '#C98468',
  proposition_envoyee: '#B66B50',
  negociation: '#8A4C37',
  gagne: '#2F7A55',
  client: '#2F7A55',
  perdu: '#B42318',
};

// --- Géocodage --------------------------------------------------------------
/** Service officiel (Base Adresse Nationale, opéré par l'IGN). Gratuit, sans clé. */
export const GEOCODER_URL = 'https://data.geopf.fr/geocodage/search';

export type AddressParts = { address: string | null; postal_code: string | null; city: string | null };
export type GeocodeResult = { lat: number; lng: number; precision: GeocodePrecision; label: string };

/** Texte envoyé au géocodeur ; null s'il n'y a rien d'exploitable. */
export function geocodeQuery(a: AddressParts): string | null {
  const parts = [a.address, a.postal_code, a.city].map((p) => (p ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (!parts.length) return null;
  if (!a.city && !a.postal_code) return null; // une rue seule est trop ambiguë
  const q = parts.join(' ');
  return q.length >= 3 ? q.slice(0, 200) : null;
}

export function geocodeUrl(a: AddressParts): string | null {
  const q = geocodeQuery(a);
  if (!q) return null;
  const u = new URL(GEOCODER_URL);
  u.searchParams.set('q', q);
  u.searchParams.set('limit', '1');
  u.searchParams.set('index', 'address');
  const cp = (a.postal_code ?? '').replace(/\s/g, '');
  if (/^\d{5}$/.test(cp)) u.searchParams.set('postcode', cp);
  return u.toString();
}

const TYPE_PRECISION: Record<string, GeocodePrecision> = {
  housenumber: 'adresse',
  street: 'rue',
  locality: 'rue',
  municipality: 'ville',
};

/** Seuil de confiance minimal (0 à 1) ; en dessous, le résultat est ignoré. */
export const MIN_SCORE = 0.4;

type Feature = {
  geometry?: { coordinates?: unknown };
  properties?: { type?: string; score?: number; label?: string };
};

export function parseGeocode(body: unknown): GeocodeResult | null {
  const f = (body as { features?: Feature[] } | null)?.features?.[0];
  if (!f) return null;
  const c = f.geometry?.coordinates;
  if (!Array.isArray(c) || c.length < 2) return null;
  const lng = Number(c[0]), lat = Number(c[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const score = Number(f.properties?.score ?? 0);
  if (score < MIN_SCORE) return null;
  const precision = TYPE_PRECISION[f.properties?.type ?? ''] ?? 'ville';
  return { lat, lng, precision, label: String(f.properties?.label ?? '').slice(0, 300) };
}

/**
 * Géocode une adresse. Renvoie :
 *  - un résultat si trouvé,
 *  - null si introuvable (réponse valide mais vide),
 *  - lève une erreur si le service est indisponible (à réessayer plus tard).
 */
export async function geocode(a: AddressParts, fetcher: typeof fetch = fetch): Promise<GeocodeResult | null> {
  const url = geocodeUrl(a);
  if (!url) return null;
  const res = await fetcher(url, { headers: { Accept: 'application/json' } });
  if (res.status === 429 || res.status >= 500) throw new Error(`Service d'adresses indisponible (${res.status})`);
  if (!res.ok) return null;
  return parseGeocode(await res.json());
}

// --- Distances -----------------------------------------------------------------
export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Longueur à vol d'oiseau d'un parcours (départ facultatif, retour facultatif). */
export function routeKm(stops: LatLng[], start?: LatLng | null, roundTrip = false): number {
  const path = start ? [start, ...stops] : stops;
  let d = 0;
  for (let i = 1; i < path.length; i++) d += distanceKm(path[i - 1]!, path[i]!);
  if (roundTrip && start && stops.length) d += distanceKm(stops[stops.length - 1]!, start);
  return d;
}

// --- Ordre de tournée ----------------------------------------------------------
/**
 * Ordre de visite le plus court possible (heuristique « plus proche voisin »
 * améliorée par 2-opt, très proche de l'optimum pour une vingtaine d'arrêts).
 * Renvoie les indices des arrêts dans l'ordre de visite.
 */
export function optimizeRoute(stops: LatLng[], start?: LatLng | null, roundTrip = false): number[] {
  const n = stops.length;
  if (n <= 1) return stops.map((_, i) => i);
  const cost = (order: number[]) => routeKm(order.map((i) => stops[i]!), start, roundTrip);

  const nearest = (first: number | null) => {
    const left = new Set(stops.map((_, i) => i));
    const order: number[] = [];
    let cur: LatLng;
    if (first === null) cur = start!;
    else { order.push(first); left.delete(first); cur = stops[first]!; }
    while (left.size) {
      let best = -1, bestD = Infinity;
      for (const i of left) {
        const d = distanceKm(cur, stops[i]!);
        if (d < bestD) { bestD = d; best = i; }
      }
      order.push(best); left.delete(best); cur = stops[best]!;
    }
    return order;
  };

  const twoOpt = (order: number[]) => {
    let best = order, bestC = cost(order), improved = true, guard = 0;
    while (improved && guard++ < 200) {
      improved = false;
      for (let i = 0; i < n - 1; i++) {
        for (let k = i + 1; k < n; k++) {
          const cand = [...best.slice(0, i), ...best.slice(i, k + 1).reverse(), ...best.slice(k + 1)];
          const c = cost(cand);
          if (c < bestC - 1e-9) { best = cand; bestC = c; improved = true; }
        }
      }
    }
    return { order: best, c: bestC };
  };

  // Avec un point de départ : on part de lui. Sans : on essaie chaque arrêt comme premier.
  const seeds = start ? [null] : stops.map((_, i) => i);
  let result = { order: stops.map((_, i) => i), c: Infinity };
  for (const s of seeds) {
    const r = twoOpt(nearest(s));
    if (r.c < result.c) result = r;
  }
  return result.order;
}

/** Position d'insertion d'un nouvel arrêt qui allonge le moins la tournée. */
export function bestInsertionIndex(stops: LatLng[], p: LatLng, start?: LatLng | null, roundTrip = false): number {
  let best = stops.length, bestC = Infinity;
  for (let i = 0; i <= stops.length; i++) {
    const c = routeKm([...stops.slice(0, i), p, ...stops.slice(i)], start, roundTrip);
    if (c < bestC - 1e-9) { bestC = c; best = i; }
  }
  return best;
}

// --- Liens de navigation -----------------------------------------------------
const fmt = (p: LatLng) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

/**
 * Liens Google Maps pour une tournée. Google limite le nombre d'étapes par lien
 * (9 sur ordinateur, 3 sur téléphone) : la tournée est découpée en tronçons si besoin,
 * chaque tronçon partant du dernier arrêt du précédent.
 * Sans point de départ, Google part de la position actuelle du téléphone.
 */
export function googleMapsLinks(stops: LatLng[], start?: LatLng | null, roundTrip = false, maxWaypoints = 9): string[] {
  const all = roundTrip && start ? [...stops, start] : [...stops];
  if (!all.length) return [];
  const perLink = maxWaypoints + 1; // étapes intermédiaires + destination
  const links: string[] = [];
  let origin: LatLng | null = start ?? null;
  for (let i = 0; i < all.length; i += perLink) {
    const chunk = all.slice(i, i + perLink);
    const dest = chunk[chunk.length - 1]!;
    const u = new URL('https://www.google.com/maps/dir/');
    u.searchParams.set('api', '1');
    if (origin) u.searchParams.set('origin', fmt(origin));
    u.searchParams.set('destination', fmt(dest));
    if (chunk.length > 1) u.searchParams.set('waypoints', chunk.slice(0, -1).map(fmt).join('|'));
    u.searchParams.set('travelmode', 'driving');
    links.push(u.toString());
    origin = dest;
  }
  return links;
}

export function googleMapsPointUrl(p: LatLng): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${fmt(p)}&travelmode=driving`;
}

export function wazeUrl(p: LatLng): string {
  return `https://waze.com/ul?ll=${fmt(p)}&navigate=yes`;
}
