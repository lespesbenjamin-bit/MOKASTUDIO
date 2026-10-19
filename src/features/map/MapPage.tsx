import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  ArrowDown, ArrowUp, Crosshair, ExternalLink, Loader2, LocateFixed, MapPin, MapPinOff, Navigation, Phone, Route, Search, Shuffle, Trash2, X,
} from 'lucide-react';
import { LEAD_STATUSES, OPEN_STATUSES, SOURCE_LABELS, STATUS_LABELS, daysFromToday, formatDay, normalizeSearch } from '@/lib/crm';
import { humanizeError, isDemo } from '@/lib/supabase';
import { useAuth } from '@/features/auth/AuthProvider';
import { useTeam } from '@/features/leads/api';
import { Alert, Badge, Button, Card, Input, Modal, PageHeader, Segmented, Select, Spinner } from '@/components/ui';
import type { LeadSource, MapPoint } from '@/types/database';
import { MapCanvas } from './MapCanvas';
import { needsGeocoding, useAutoGeocode, useMapPoints, useSetManualPosition } from './api';
import {
  PIN_COLORS, bestInsertionIndex, googleMapsLinks, googleMapsPointUrl, optimizeRoute, routeKm, wazeUrl,
  type LatLng, type MapStatus,
} from './geo';
import './map.css';

type Kind = 'tous' | 'prospect' | 'client';
const LEGEND: MapStatus[] = [...LEAD_STATUSES.filter((s) => s !== 'gagne'), 'client'];
const LABEL = (s: MapStatus) => (s === 'client' ? 'Client' : STATUS_LABELS[s]);
const MAX_STOPS = 25;
const TOUR_KEY = 'moka.map.tour';

const pos = (p: MapPoint): LatLng => ({ lat: p.latitude!, lng: p.longitude! });
const located = (p: MapPoint) => p.latitude !== null && p.longitude !== null;
const ficheUrl = (p: MapPoint) => (p.kind === 'client' && p.contract_id ? `/clients/${p.contract_id}` : p.lead_id ? `/prospects/${p.lead_id}` : null);
const isLate = (p: MapPoint) =>
  p.kind === 'prospect' && !!p.next_follow_up_at && daysFromToday(p.next_follow_up_at) < 0 && OPEN_STATUSES.includes(p.status as never);

type TourState = { ids: string[]; fromMe: boolean; roundTrip: boolean };
function readTour(): TourState {
  try {
    const t = JSON.parse(localStorage.getItem(TOUR_KEY) ?? '') as TourState;
    if (Array.isArray(t.ids)) return { ids: t.ids.slice(0, MAX_STOPS), fromMe: !!t.fromMe, roundTrip: !!t.roundTrip };
  } catch { /* rien d'enregistré */ }
  return { ids: [], fromMe: true, roundTrip: false };
}

const isTouch = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

export function MapPage() {
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const query = useMapPoints();
  const team = useTeam(isAdmin);
  const all = useMemo(() => query.data ?? [], [query.data]);
  const geo = useAutoGeocode(query.data);
  const place = useSetManualPosition();

  // Filtres
  const [kind, setKind] = useState<Kind>('tous');
  const [hidden, setHidden] = useState<Set<MapStatus>>(() => new Set(['perdu']));
  const [owner, setOwner] = useState('');
  const [source, setSource] = useState<LeadSource | ''>('');
  const [lateOnly, setLateOnly] = useState(false);
  const [q, setQ] = useState('');

  const visible = useMemo(() => {
    const nq = normalizeSearch(q);
    return all.filter((p) =>
      (kind === 'tous' || p.kind === kind)
      && !hidden.has(p.status)
      && (!owner || (owner === 'none' ? !p.owner_id : p.owner_id === owner))
      && (!source || p.source === source)
      && (!lateOnly || isLate(p))
      && (!nq || normalizeSearch(`${p.company_name} ${p.city ?? ''}`).includes(nq)));
  }, [all, kind, hidden, owner, source, lateOnly, q]);

  const counts = useMemo(() => {
    const c = new Map<MapStatus, number>();
    for (const p of all) c.set(p.status, (c.get(p.status) ?? 0) + 1);
    return c;
  }, [all]);

  const onMap = visible.filter(located);
  const missing = all.filter((p) => !located(p));
  const pending = missing.filter(needsGeocoding);
  const notFound = missing.filter((p) => !needsGeocoding(p));

  // Sélection, position, recadrage
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = all.find((p) => p.company_id === selectedId) ?? null;
  const [me, setMe] = useState<LatLng | null>(null);
  const [locError, setLocError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [focus, setFocus] = useState<{ at: LatLng; zoom: number; key: number } | null>(null);
  const [placingId, setPlacingId] = useState<string | null>(null);
  const [missingOpen, setMissingOpen] = useState(false);
  const fitKey = `${kind}|${[...hidden].join()}|${owner}|${source}|${lateOnly}|${q}|${query.dataUpdatedAt ? 'ok' : ''}`;

  const locate = (then?: (p: LatLng) => void) => {
    if (!navigator.geolocation) { setLocError('Votre navigateur ne permet pas la géolocalisation.'); return; }
    setLocating(true);
    setLocError(null);
    navigator.geolocation.getCurrentPosition(
      (r) => {
        const p = { lat: r.coords.latitude, lng: r.coords.longitude };
        setMe(p); setLocating(false);
        then?.(p);
      },
      (e) => {
        setLocating(false);
        setLocError(e.code === e.PERMISSION_DENIED
          ? 'Accès à votre position refusé. Autorisez la localisation pour ce site dans les réglages du navigateur.'
          : 'Position introuvable pour le moment. Réessayez dans un instant.');
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  // Tournée
  const [tourOpen, setTourOpen] = useState(false);
  const [tour, setTour] = useState<TourState>(readTour);
  useEffect(() => {
    try { localStorage.setItem(TOUR_KEY, JSON.stringify(tour)); } catch { /* stockage indisponible */ }
  }, [tour]);
  const stops = tour.ids.map((id) => all.find((p) => p.company_id === id)).filter((p): p is MapPoint => !!p && located(p));
  const start = tour.fromMe ? me : null;
  const inTour = (id: string) => tour.ids.includes(id);

  useEffect(() => {
    if (tourOpen && tour.fromMe && !me && !locating) locate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourOpen, tour.fromMe]);

  const toggleStop = (p: MapPoint) => {
    if (!located(p)) return;
    setTour((t) => {
      if (t.ids.includes(p.company_id)) return { ...t, ids: t.ids.filter((x) => x !== p.company_id) };
      if (t.ids.length >= MAX_STOPS) return t;
      const at = bestInsertionIndex(stops.map(pos), pos(p), start, t.roundTrip);
      const ids = stops.map((s) => s.company_id);
      ids.splice(at, 0, p.company_id);
      return { ...t, ids };
    });
    setTourOpen(true);
  };
  const optimize = () => {
    const order = optimizeRoute(stops.map(pos), start, tour.roundTrip);
    setTour((t) => ({ ...t, ids: order.map((i) => stops[i]!.company_id) }));
  };
  const move = (i: number, d: -1 | 1) => setTour((t) => {
    const ids = stops.map((s) => s.company_id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return t;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    return { ...t, ids };
  });
  const km = routeKm(stops.map(pos), start, tour.roundTrip);
  const links = googleMapsLinks(stops.map(pos), start, tour.roundTrip, isTouch() ? 3 : 9);

  const onSelect = (p: MapPoint | null) => setSelectedId(p?.company_id ?? null);

  const onPlace = (at: LatLng) => {
    if (!placingId) return;
    place.mutate({ companyId: placingId, lat: at.lat, lng: at.lng }, {
      onSuccess: () => { setSelectedId(placingId); setPlacingId(null); },
    });
  };
  const placing = all.find((p) => p.company_id === placingId);

  if (query.isLoading) return <Spinner />;
  if (query.error) return <Alert>{humanizeError(query.error)}</Alert>;

  return (
    <div>
      <PageHeader
        title="Carte"
        description={`${onMap.length} point${onMap.length > 1 ? 's' : ''} affiché${onMap.length > 1 ? 's' : ''} · ${all.filter((p) => p.kind === 'prospect').length} prospects · ${all.filter((p) => p.kind === 'client').length} clients`}
        actions={(
          <>
            <Button variant="secondary" icon={<LocateFixed className="h-4 w-4" />} loading={locating}
              onClick={() => locate((p) => setFocus({ at: p, zoom: 12, key: Date.now() }))}>
              Autour de moi
            </Button>
            <Button variant={tourOpen ? 'primary' : 'secondary'} icon={<Route className="h-4 w-4" />} onClick={() => setTourOpen((o) => !o)}>
              Tournée{stops.length ? ` (${stops.length})` : ''}
            </Button>
          </>
        )}
      />

      {/* Filtres */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented<Kind> label="Type" value={kind} onChange={setKind}
          options={[{ value: 'tous', label: 'Tous' }, { value: 'prospect', label: 'Prospects' }, { value: 'client', label: 'Clients' }]} />
        <div className="relative w-44">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-anthracite-300" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, ville…" className="h-9 pl-9" aria-label="Rechercher" />
        </div>
        {isAdmin && (
          <div className="w-56"><Select value={owner} onChange={(e) => setOwner(e.target.value)} className="h-9" aria-label="Commercial">
            <option value="">Tous les commerciaux</option>
            {(team.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            <option value="none">Non attribués</option>
          </Select></div>
        )}
        <div className="w-52"><Select value={source} onChange={(e) => setSource(e.target.value as LeadSource | '')} className="h-9" aria-label="Source">
          <option value="">Toutes les sources</option>
          {Object.entries(SOURCE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select></div>
        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-beige-300 bg-white px-3 text-sm text-anthracite-700">
          <input type="checkbox" checked={lateOnly} onChange={(e) => setLateOnly(e.target.checked)} className="accent-terracotta" />
          Relance en retard
        </label>
      </div>

      {/* Légende = filtre par statut */}
      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Statuts affichés">
        {LEGEND.map((s) => {
          const off = hidden.has(s);
          return (
            <button key={s} type="button" aria-pressed={!off}
              onClick={() => setHidden((h) => { const n = new Set(h); if (n.has(s)) n.delete(s); else n.add(s); return n; })}
              className={clsx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                off ? 'border-beige-300 bg-transparent text-anthracite-300 line-through' : 'border-beige-300 bg-white text-anthracite-700')}>
              <span className={clsx('h-2.5 w-2.5 border border-white shadow-sm', s === 'client' ? 'rotate-45 rounded-[2px]' : 'rounded-full')}
                style={{ background: PIN_COLORS[s], opacity: off ? 0.35 : 1 }} aria-hidden />
              {LABEL(s)} <span className="text-anthracite-300">{counts.get(s) ?? 0}</span>
            </button>
          );
        })}
      </div>

      {/* État du géocodage */}
      {geo.progress.running && (
        <div className="mb-3 flex items-center gap-3 rounded-lg border border-beige-300 bg-white px-3 py-2 text-sm text-anthracite-700">
          <Loader2 className="h-4 w-4 animate-spin text-terracotta" aria-hidden />
          <span>Localisation des adresses… {geo.progress.done} / {geo.progress.total}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded bg-beige"><div className="h-full bg-terracotta" style={{ width: `${(geo.progress.done / Math.max(1, geo.progress.total)) * 100}%` }} /></div>
          <Button size="sm" variant="ghost" onClick={geo.stop}>Arrêter</Button>
        </div>
      )}
      {geo.progress.error && (
        <div className="mb-3"><Alert>
          {geo.progress.error}. Les positions déjà trouvées sont enregistrées.{' '}
          <button className="font-medium underline" onClick={geo.retry}>Réessayer</button>
        </Alert></div>
      )}
      {!geo.progress.running && pending.length > 0 && !isDemo && !geo.progress.error && (
        <div className="mb-3 text-sm text-anthracite-500">
          {pending.length} adresse{pending.length > 1 ? 's' : ''} en attente de localisation.{' '}
          <button className="font-medium text-terracotta-700 underline" onClick={geo.retry}>Localiser maintenant</button>
        </div>
      )}
      {placing && (
        <div className="mb-3"><Alert tone="info">
          Cliquez sur la carte à l’emplacement de <strong>{placing.company_name}</strong>.{' '}
          <button className="font-medium underline" onClick={() => setPlacingId(null)}>Annuler</button>
          {place.error && <span className="block">{humanizeError(place.error)}</span>}
        </Alert></div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Carte */}
        <div className="relative h-[62vh] min-h-[380px] w-full overflow-hidden lg:flex-1 rounded-xl border border-beige-300 bg-beige shadow-card">
          <MapCanvas
            points={onMap} selectedId={selectedId} onSelect={onSelect} tour={stops} tourStart={start}
            roundTrip={tour.roundTrip} me={me} placing={!!placingId} onPlace={onPlace} fitKey={fitKey} focus={focus}
          />
          {selected && (
            <PointCard p={selected} inTour={inTour(selected.company_id)} tourFull={tour.ids.length >= MAX_STOPS}
              onClose={() => setSelectedId(null)} onToggleTour={() => toggleStop(selected)}
              onPlace={() => { setPlacingId(selected.company_id); setSelectedId(null); }} />
          )}
          {missing.length > 0 && (
            <button onClick={() => setMissingOpen(true)}
              className="absolute right-3 top-3 z-[500] inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-medium text-anthracite-700 shadow-card hover:bg-white">
              <MapPinOff className="h-3.5 w-3.5" /> {missing.length} non localisé{missing.length > 1 ? 's' : ''}
            </button>
          )}
        </div>

        {/* Tournée */}
        {tourOpen && (
          <Card className="w-full shrink-0 p-4 lg:w-80">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">Tournée</h2>
              <button className="text-anthracite-500 hover:text-anthracite" onClick={() => setTourOpen(false)} aria-label="Fermer la tournée"><X className="h-4 w-4" /></button>
            </div>
            {!stops.length ? (
              <p className="text-sm text-anthracite-500">
                Cliquez sur les épingles puis sur <strong>« Ajouter à la tournée »</strong>. L’ordre de visite le plus court est calculé automatiquement.
              </p>
            ) : (
              <>
                <ol className="mb-3 max-h-[40vh] space-y-1 overflow-y-auto">
                  {stops.map((s, i) => (
                    <li key={s.company_id} className={clsx('flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm', selectedId === s.company_id ? 'bg-beige' : 'hover:bg-creme')}>
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-anthracite text-xs font-semibold text-white">{i + 1}</span>
                      <button className="min-w-0 flex-1 text-left" onClick={() => { setSelectedId(s.company_id); setFocus({ at: pos(s), zoom: 15, key: Date.now() }); }}>
                        <span className="block truncate font-medium">{s.company_name}</span>
                        <span className="block truncate text-xs text-anthracite-500">{s.city ?? '—'}</span>
                      </button>
                      <button className="p-0.5 text-anthracite-300 hover:text-anthracite disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Monter"><ArrowUp className="h-3.5 w-3.5" /></button>
                      <button className="p-0.5 text-anthracite-300 hover:text-anthracite disabled:opacity-30" disabled={i === stops.length - 1} onClick={() => move(i, 1)} aria-label="Descendre"><ArrowDown className="h-3.5 w-3.5" /></button>
                      <button className="p-0.5 text-anthracite-300 hover:text-red-700" onClick={() => toggleStop(s)} aria-label="Retirer"><X className="h-3.5 w-3.5" /></button>
                    </li>
                  ))}
                </ol>
                <div className="mb-3 space-y-1.5 text-sm text-anthracite-700">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="accent-terracotta" checked={tour.fromMe} onChange={(e) => setTour((t) => ({ ...t, fromMe: e.target.checked }))} />
                    Partir de ma position {tour.fromMe && !me && <span className="text-xs text-anthracite-500">(en attente…)</span>}
                  </label>
                  <label className={clsx('flex items-center gap-2', !tour.fromMe && 'opacity-50')}>
                    <input type="checkbox" className="accent-terracotta" disabled={!tour.fromMe} checked={tour.roundTrip} onChange={(e) => setTour((t) => ({ ...t, roundTrip: e.target.checked }))} />
                    Revenir au point de départ
                  </label>
                </div>
                <p className="mb-3 text-sm text-anthracite-500">
                  {stops.length} arrêt{stops.length > 1 ? 's' : ''} · ≈ {Math.round(km)} km à vol d’oiseau
                  <span className="block text-xs">Le trajet et le temps réels sont calculés par Google Maps.</span>
                </p>
                <div className="space-y-2">
                  <Button variant="secondary" className="w-full" icon={<Shuffle className="h-4 w-4" />} onClick={optimize} disabled={stops.length < 3}>
                    Optimiser l’ordre
                  </Button>
                  {links.map((href, i) => (
                    <a key={href} href={href} target="_blank" rel="noopener noreferrer"
                      className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-terracotta px-4 text-sm font-medium text-white shadow-sm hover:bg-terracotta-600">
                      <Navigation className="h-4 w-4" />
                      {links.length > 1 ? `Google Maps — tronçon ${i + 1}/${links.length}` : 'Ouvrir dans Google Maps'}
                    </a>
                  ))}
                  <Button variant="ghost" className="w-full" icon={<Trash2 className="h-4 w-4" />} onClick={() => setTour((t) => ({ ...t, ids: [] }))}>
                    Vider la tournée
                  </Button>
                </div>
              </>
            )}
            {locError && <div className="mt-3"><Alert>{locError}</Alert></div>}
          </Card>
        )}
      </div>
      {locError && !tourOpen && <div className="mt-3"><Alert>{locError}</Alert></div>}

      <p className="mt-2 text-xs text-anthracite-300">
        Épingle ronde : prospect · losange : client · contour pointillé : position approximative (ville seulement).
        Adresses localisées avec le service officiel Géoplateforme (IGN).
      </p>

      <Modal open={missingOpen} onClose={() => setMissingOpen(false)} title="Entreprises non localisées" size="lg"
        description="Complétez l’adresse dans la fiche (elle sera relocalisée automatiquement) ou placez l’épingle à la main.">
        <ul className="divide-y divide-beige-300">
          {[...notFound, ...pending].map((p) => (
            <li key={p.company_id} className="flex items-center gap-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{p.company_name}</div>
                <div className="truncate text-xs text-anthracite-500">
                  {[p.address, p.postal_code, p.city].filter(Boolean).join(' ') || 'Aucune adresse'} ·{' '}
                  {needsGeocoding(p) ? 'en attente' : p.geocode_precision === 'introuvable' ? 'adresse introuvable' : 'adresse incomplète'}
                </div>
              </div>
              {ficheUrl(p) && <Link to={ficheUrl(p)!} className="text-xs font-medium text-terracotta-700 hover:underline">Fiche</Link>}
              {!isDemo && (
                <Button size="sm" variant="secondary" icon={<Crosshair className="h-3.5 w-3.5" />}
                  onClick={() => { setPlacingId(p.company_id); setMissingOpen(false); }}>
                  Placer
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}

function PointCard({ p, inTour, tourFull, onClose, onToggleTour, onPlace }: {
  p: MapPoint; inTour: boolean; tourFull: boolean; onClose: () => void; onToggleTour: () => void; onPlace: () => void;
}) {
  const url = ficheUrl(p);
  const contact = [p.contact_first_name, p.contact_last_name].filter(Boolean).join(' ');
  const at = located(p) ? pos(p) : null;
  return (
    <div className="absolute inset-x-3 bottom-3 z-[500] rounded-xl border border-beige-300 bg-white p-4 shadow-lg sm:left-3 sm:right-auto sm:w-80">
      <button className="absolute right-3 top-3 text-anthracite-300 hover:text-anthracite" onClick={onClose} aria-label="Fermer"><X className="h-4 w-4" /></button>
      <div className="pr-6">
        <div className="mb-1 flex items-center gap-2">
          <span className={clsx('h-2.5 w-2.5 shrink-0', p.kind === 'client' ? 'rotate-45 rounded-[2px]' : 'rounded-full')} style={{ background: PIN_COLORS[p.status] }} aria-hidden />
          <span className="text-xs font-medium text-anthracite-500">{LABEL(p.status)}</span>
          {isLate(p) && <Badge tone="danger">Relance en retard</Badge>}
          {p.overdue_payments > 0 && <Badge tone="danger">Impayé</Badge>}
        </div>
        <h3 className="font-display text-base font-semibold leading-tight">{p.company_name}</h3>
        <p className="mt-0.5 text-sm text-anthracite-500">
          {[p.address, p.postal_code, p.city].filter(Boolean).join(' ') || 'Adresse non renseignée'}
          {p.geocode_precision === 'ville' && <span className="block text-xs">Position approximative (ville)</span>}
        </p>
        <dl className="mt-2 space-y-0.5 text-sm text-anthracite-700">
          {contact && <div>{contact}</div>}
          {p.contact_phone && (
            <a href={`tel:${p.contact_phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-1 text-terracotta-700 hover:underline">
              <Phone className="h-3.5 w-3.5" /> {p.contact_phone}
            </a>
          )}
          <div className="text-xs text-anthracite-500">
            {p.owner_name ? `Suivi par ${p.owner_name}` : 'Non attribué'}
            {p.next_follow_up_at && ` · relance ${formatDay(p.next_follow_up_at).toLowerCase()}`}
          </div>
        </dl>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {url && <Link to={url} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-anthracite px-3 text-sm font-medium text-white hover:bg-anthracite-700"><ExternalLink className="h-3.5 w-3.5" /> Fiche</Link>}
        {at && (
          <>
            <a href={googleMapsPointUrl(at)} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-beige-300 px-3 text-sm text-anthracite-700 hover:bg-creme">
              <Navigation className="h-3.5 w-3.5" /> Google Maps
            </a>
            <a href={wazeUrl(at)} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center rounded-lg border border-beige-300 px-3 text-sm text-anthracite-700 hover:bg-creme">Waze</a>
          </>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {at && (
          <Button size="sm" variant={inTour ? 'secondary' : 'primary'} icon={<Route className="h-3.5 w-3.5" />} onClick={onToggleTour} disabled={!inTour && tourFull}>
            {inTour ? 'Retirer de la tournée' : tourFull ? `Tournée pleine (${MAX_STOPS})` : 'Ajouter à la tournée'}
          </Button>
        )}
        {!isDemo && (
          <Button size="sm" variant="ghost" icon={<MapPin className="h-3.5 w-3.5" />} onClick={onPlace}>Déplacer l’épingle</Button>
        )}
      </div>
    </div>
  );
}
