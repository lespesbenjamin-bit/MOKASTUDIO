import { useEffect, useRef } from 'react';
import L from './leaflet';
import 'leaflet.markercluster';
import type { MapPoint } from '@/types/database';
import { PIN_COLORS, type LatLng } from './geo';

type Props = {
  points: MapPoint[];
  selectedId: string | null;
  onSelect: (p: MapPoint | null) => void;
  /** Arrêts de la tournée, dans l'ordre */
  tour: MapPoint[];
  tourStart: LatLng | null;
  roundTrip: boolean;
  me: LatLng | null;
  /** Mode « placer à la main » : le prochain clic sur la carte renvoie la position */
  placing: boolean;
  onPlace: (p: LatLng) => void;
  /** Change de valeur → recadrage sur les points */
  fitKey: string;
  focus: { at: LatLng; zoom: number; key: number } | null;
};

const FRANCE: L.LatLngBoundsExpression = [[42.3, -4.8], [51.1, 8.2]];

function pinIcon(p: MapPoint) {
  const color = PIN_COLORS[p.status] ?? '#6E6A63';
  const approx = p.geocode_precision === 'ville';
  const cls = `moka-pin${p.kind === 'client' ? ' moka-pin--client' : ''}${approx ? ' moka-pin--approx' : ''}`;
  return L.divIcon({
    className: '',
    html: `<span class="${cls}" style="--pin:${color}"></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function stopIcon(n: number) {
  return L.divIcon({ className: '', html: `<span class="moka-stop">${n}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] });
}

export function MapCanvas(props: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const cluster = useRef<L.MarkerClusterGroup | null>(null);
  const tourLayer = useRef<L.LayerGroup | null>(null);
  const extra = useRef<L.LayerGroup | null>(null);
  const cb = useRef(props);
  cb.current = props;

  // Création de la carte (une fois)
  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true, maxZoom: 19 });
    m.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
    m.fitBounds(FRANCE);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
      className: 'moka-tiles',
    }).addTo(m);
    cluster.current = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 48,
      spiderfyOnMaxZoom: true,
      iconCreateFunction: (c) => {
        const n = c.getChildCount();
        const size = n < 10 ? 34 : n < 100 ? 40 : 48;
        return L.divIcon({ className: '', html: `<span class="moka-cluster" style="width:${size}px;height:${size}px">${n}</span>`, iconSize: [size, size] });
      },
    }).addTo(m);
    tourLayer.current = L.layerGroup().addTo(m);
    extra.current = L.layerGroup().addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => {
      if (cb.current.placing) cb.current.onPlace({ lat: e.latlng.lat, lng: e.latlng.lng });
      else cb.current.onSelect(null);
    });
    map.current = m;
    // La carte peut être créée avant que son conteneur ait sa taille définitive
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => { ro.disconnect(); m.remove(); map.current = null; };
  }, []);

  // Épingles
  useEffect(() => {
    const c = cluster.current;
    if (!c) return;
    c.clearLayers();
    const inTour = new Set(props.tour.map((t) => t.company_id));
    const markers = props.points
      .filter((p) => p.latitude !== null && p.longitude !== null && !inTour.has(p.company_id))
      .map((p) => {
        const mk = L.marker([p.latitude!, p.longitude!], { icon: pinIcon(p), title: p.company_name, keyboard: true });
        mk.on('click', () => cb.current.onSelect(p));
        return mk;
      });
    c.addLayers(markers);
  }, [props.points, props.tour]);

  // Tournée : arrêts numérotés + tracé
  useEffect(() => {
    const g = tourLayer.current;
    if (!g) return;
    g.clearLayers();
    const pts = props.tour.filter((p) => p.latitude !== null);
    if (!pts.length) return;
    const path: L.LatLngExpression[] = pts.map((p) => [p.latitude!, p.longitude!]);
    if (props.tourStart) path.unshift([props.tourStart.lat, props.tourStart.lng]);
    if (props.roundTrip && props.tourStart) path.push([props.tourStart.lat, props.tourStart.lng]);
    L.polyline(path, { color: '#292724', weight: 3, opacity: 0.7, dashArray: '6 6' }).addTo(g);
    pts.forEach((p, i) => {
      const mk = L.marker([p.latitude!, p.longitude!], { icon: stopIcon(i + 1), title: p.company_name, zIndexOffset: 1000 });
      mk.on('click', () => cb.current.onSelect(p));
      mk.addTo(g);
    });
  }, [props.tour, props.tourStart, props.roundTrip]);

  // Sélection + position de l'utilisateur
  useEffect(() => {
    const g = extra.current;
    if (!g) return;
    g.clearLayers();
    if (props.me) {
      L.circleMarker([props.me.lat, props.me.lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#1D7FB8', fillOpacity: 1 })
        .bindTooltip('Vous êtes ici').addTo(g);
    }
    const sel = props.points.find((p) => p.company_id === props.selectedId) ?? props.tour.find((p) => p.company_id === props.selectedId);
    if (sel?.latitude != null) {
      L.circleMarker([sel.latitude, sel.longitude!], { radius: 18, color: '#292724', weight: 2, fill: false, interactive: false }).addTo(g);
    }
  }, [props.selectedId, props.me, props.points, props.tour]);

  // Recadrage
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const coords = props.points.filter((p) => p.latitude !== null).map((p) => [p.latitude!, p.longitude!] as [number, number]);
    if (coords.length) m.fitBounds(L.latLngBounds(coords), { padding: [40, 40], maxZoom: 14 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.fitKey]);

  useEffect(() => {
    if (props.focus && map.current) map.current.setView([props.focus.at.lat, props.focus.at.lng], props.focus.zoom);
  }, [props.focus]);

  return (
    <div
      ref={el}
      className={`absolute inset-0 ${props.placing ? 'moka-placing' : ''}`}
      role="application"
      aria-label="Carte des prospects et clients"
    />
  );
}
