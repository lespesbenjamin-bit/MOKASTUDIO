import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isDemo, supabase } from '@/lib/supabase';
import type { GeocodePrecision, MapPoint } from '@/types/database';
import { geocode, geocodeQuery } from './geo';

export const mapKeys = { points: ['map-points'] as const };

function unwrap<R extends { data: unknown; error: unknown }>(res: R): Extract<R, { error: null }>['data'] {
  if (res.error) throw res.error;
  return res.data as Extract<R, { error: null }>['data'];
}

export function useMapPoints() {
  return useQuery({
    queryKey: mapKeys.points,
    queryFn: async () => (unwrap(await supabase.from('map_points').select('*').limit(5000)) ?? []) as MapPoint[],
  });
}

type Position = { latitude: number | null; longitude: number | null; geocode_precision: GeocodePrecision; geocode_label: string | null };

async function savePosition(companyId: string, p: Position) {
  const res = await supabase.from('companies')
    .update({ ...p, geocoded_at: new Date().toISOString() })
    .eq('id', companyId).select('id');
  const rows = unwrap(res) ?? [];
  if (!rows.length) throw new Error('Modification non autorisée pour cette entreprise.');
}

/** Position posée à la main sur la carte. */
export function useSetManualPosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ companyId, lat, lng }: { companyId: string; lat: number; lng: number }) =>
      savePosition(companyId, { latitude: lat, longitude: lng, geocode_precision: 'manuel', geocode_label: null }),
    onSuccess: () => qc.invalidateQueries({ queryKey: mapKeys.points }),
  });
}

/** Entreprises à géolocaliser : jamais traitées et avec au moins une ville ou un code postal. */
export function needsGeocoding(p: MapPoint) {
  return !p.geocoded_at && geocodeQuery(p) !== null;
}

export type GeocodeProgress = { running: boolean; done: number; total: number; found: number; notFound: number; error: string | null };

const DELAY_MS = 120; // ≈ 8 adresses par seconde (le service en autorise 50)

/**
 * Géolocalise en arrière-plan les entreprises qui n'ont pas encore de position,
 * puis enregistre le résultat (ou « introuvable ») dans la base.
 * Désactivé en mode démonstration.
 */
export function useAutoGeocode(points: MapPoint[] | undefined) {
  const qc = useQueryClient();
  const [progress, setProgress] = useState<GeocodeProgress>({ running: false, done: 0, total: 0, found: 0, notFound: 0, error: null });
  const stopRef = useRef(false);
  const runningRef = useRef(false);
  const failed = useRef(new Set<string>());
  const blocked = useRef(false); // service en panne : pas de relance automatique

  const run = useCallback(async (list: MapPoint[], manual = false) => {
    if (runningRef.current || isDemo) return;
    if (blocked.current && !manual) return;
    blocked.current = false;
    const todo = list.filter((p) => needsGeocoding(p) && !failed.current.has(p.company_id));
    if (!todo.length) return;
    runningRef.current = true;
    stopRef.current = false;
    let found = 0, notFound = 0, done = 0;
    setProgress({ running: true, done, total: todo.length, found, notFound, error: null });
    try {
      for (const p of todo) {
        if (stopRef.current) break;
        const r = await geocode(p);
        try {
          await savePosition(p.company_id, r
            ? { latitude: r.lat, longitude: r.lng, geocode_precision: r.precision, geocode_label: r.label }
            : { latitude: null, longitude: null, geocode_precision: 'introuvable', geocode_label: null });
          if (r) found++; else notFound++;
        } catch {
          failed.current.add(p.company_id); // pas le droit de modifier : on n'insiste pas
        }
        done++;
        setProgress((s) => ({ ...s, done, found, notFound }));
        if (done % 10 === 0) void qc.invalidateQueries({ queryKey: mapKeys.points });
        await new Promise((res) => setTimeout(res, DELAY_MS));
      }
      setProgress((s) => ({ ...s, running: false }));
    } catch (e) {
      blocked.current = true;
      setProgress((s) => ({ ...s, running: false, error: e instanceof Error ? e.message : 'Service d’adresses indisponible' }));
    } finally {
      runningRef.current = false;
      void qc.invalidateQueries({ queryKey: mapKeys.points });
    }
  }, [qc]);

  useEffect(() => {
    if (points) void run(points);
  }, [points, run]);

  useEffect(() => () => { stopRef.current = true; }, []);

  return {
    progress,
    stop: () => { stopRef.current = true; blocked.current = true; },
    retry: () => { if (points) void run(points, true); },
  };
}
