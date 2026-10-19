// Leaflet doit être global avant le chargement de l'extension de regroupement.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';

(window as unknown as { L: typeof L }).L = L;

export default L;
