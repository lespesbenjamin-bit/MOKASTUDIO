import { describe, expect, it } from 'vitest';
import {
  bestInsertionIndex, distanceKm, geocode, geocodeQuery, geocodeUrl, googleMapsLinks, optimizeRoute, parseGeocode, routeKm, wazeUrl,
} from './geo';

const TOULOUSE = { lat: 43.6045, lng: 1.444 };
const PARIS = { lat: 48.8566, lng: 2.3522 };

describe('géocodage', () => {
  it('construit la requête à partir de l\'adresse', () => {
    expect(geocodeQuery({ address: ' 12  rue des Lois ', postal_code: '31000', city: 'Toulouse' })).toBe('12 rue des Lois 31000 Toulouse');
    expect(geocodeQuery({ address: '12 rue des Lois', postal_code: null, city: null })).toBeNull();
    expect(geocodeQuery({ address: null, postal_code: null, city: null })).toBeNull();
    expect(geocodeQuery({ address: null, postal_code: null, city: 'Muret' })).toBe('Muret');
  });

  it('appelle le service de la Géoplateforme avec le code postal en filtre', () => {
    const u = new URL(geocodeUrl({ address: '1 place du Capitole', postal_code: '31000', city: 'Toulouse' })!);
    expect(u.origin + u.pathname).toBe('https://data.geopf.fr/geocodage/search');
    expect(u.searchParams.get('q')).toBe('1 place du Capitole 31000 Toulouse');
    expect(u.searchParams.get('postcode')).toBe('31000');
    expect(u.searchParams.get('limit')).toBe('1');
  });

  const feature = (type: string, score: number) => ({
    features: [{ geometry: { coordinates: [1.444, 43.6045] }, properties: { type, score, label: 'Place du Capitole 31000 Toulouse' } }],
  });

  it('lit la réponse (longitude, latitude) et la précision', () => {
    expect(parseGeocode(feature('housenumber', 0.9))).toEqual({ lat: 43.6045, lng: 1.444, precision: 'adresse', label: 'Place du Capitole 31000 Toulouse' });
    expect(parseGeocode(feature('street', 0.8))?.precision).toBe('rue');
    expect(parseGeocode(feature('municipality', 0.8))?.precision).toBe('ville');
  });

  it('ignore les résultats peu fiables ou mal formés', () => {
    expect(parseGeocode(feature('housenumber', 0.2))).toBeNull();
    expect(parseGeocode({ features: [] })).toBeNull();
    expect(parseGeocode(null)).toBeNull();
    expect(parseGeocode({ features: [{ geometry: { coordinates: ['x', 'y'] }, properties: { score: 1 } }] })).toBeNull();
  });

  it('distingue « introuvable » (null) et « service indisponible » (erreur)', async () => {
    const ok = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
    const a = { address: '1 rue X', postal_code: '31000', city: 'Toulouse' };
    expect(await geocode(a, ok(feature('housenumber', 0.9)))).not.toBeNull();
    expect(await geocode(a, ok({ features: [] }))).toBeNull();
    await expect(geocode(a, ok({}, 503))).rejects.toThrow(/indisponible/);
    await expect(geocode(a, ok({}, 429))).rejects.toThrow();
  });
});

describe('distances et tournée', () => {
  it('distance Toulouse – Paris ≈ 588 km à vol d\'oiseau', () => {
    expect(distanceKm(TOULOUSE, PARIS)).toBeGreaterThan(580);
    expect(distanceKm(TOULOUSE, PARIS)).toBeLessThan(595);
    expect(distanceKm(TOULOUSE, TOULOUSE)).toBe(0);
  });

  // Points alignés sur une droite, donnés dans le désordre
  const line = [5, 1, 4, 2, 3].map((k) => ({ lat: 43.6, lng: 1 + k * 0.1 }));

  it('remet dans l\'ordre des points alignés', () => {
    const order = optimizeRoute(line, { lat: 43.6, lng: 1 });
    expect(order.map((i) => line[i]!.lng.toFixed(1))).toEqual(['1.1', '1.2', '1.3', '1.4', '1.5']);
  });

  it('sans départ : parcours d\'un bout à l\'autre', () => {
    const order = optimizeRoute(line);
    const lngs = order.map((i) => Number(line[i]!.lng.toFixed(1)));
    expect([lngs[0], lngs[4]].sort()).toEqual([1.1, 1.5]);
  });

  it('ne fait jamais pire que l\'ordre de saisie', () => {
    const pts = Array.from({ length: 14 }, (_, i) => ({ lat: 43.5 + ((i * 37) % 11) / 50, lng: 1.3 + ((i * 53) % 13) / 50 }));
    const start = { lat: 43.6, lng: 1.44 };
    const order = optimizeRoute(pts, start, true);
    expect(new Set(order).size).toBe(pts.length);
    expect(routeKm(order.map((i) => pts[i]!), start, true)).toBeLessThanOrEqual(routeKm(pts, start, true));
  });

  it('un nouvel arrêt s\'insère là où il allonge le moins le trajet', () => {
    const stops = [1.1, 1.2, 1.4].map((lng) => ({ lat: 43.6, lng }));
    expect(bestInsertionIndex(stops, { lat: 43.6, lng: 1.3 }, { lat: 43.6, lng: 1 })).toBe(2);
    expect(bestInsertionIndex(stops, { lat: 43.6, lng: 1.6 }, { lat: 43.6, lng: 1 })).toBe(3);
    expect(bestInsertionIndex([], TOULOUSE)).toBe(0);
  });

  it('cas limites', () => {
    expect(optimizeRoute([])).toEqual([]);
    expect(optimizeRoute([TOULOUSE])).toEqual([0]);
  });
});

describe('liens de navigation', () => {
  const stops = Array.from({ length: 5 }, (_, i) => ({ lat: 43 + i / 10, lng: 1 + i / 10 }));

  it('un seul lien Google Maps : départ, étapes, destination', () => {
    const [link, ...rest] = googleMapsLinks(stops, TOULOUSE);
    expect(rest).toHaveLength(0);
    const u = new URL(link!);
    expect(u.searchParams.get('origin')).toBe('43.604500,1.444000');
    expect(u.searchParams.get('destination')).toBe('43.400000,1.400000');
    expect(u.searchParams.get('waypoints')!.split('|')).toHaveLength(4);
  });

  it('sans départ : Google part de la position actuelle', () => {
    expect(new URL(googleMapsLinks(stops)[0]!).searchParams.has('origin')).toBe(false);
  });

  it('boucle : retour au point de départ', () => {
    expect(new URL(googleMapsLinks(stops, TOULOUSE, true)[0]!).searchParams.get('destination')).toBe('43.604500,1.444000');
  });

  it('découpe en tronçons sur téléphone (3 étapes max par lien)', () => {
    const links = googleMapsLinks(stops, TOULOUSE, false, 3);
    expect(links).toHaveLength(2);
    // le 2e tronçon part du dernier arrêt du 1er
    expect(new URL(links[1]!).searchParams.get('origin')).toBe(new URL(links[0]!).searchParams.get('destination'));
  });

  it('lien Waze', () => {
    expect(wazeUrl(TOULOUSE)).toBe('https://waze.com/ul?ll=43.604500,1.444000&navigate=yes');
  });
});
