// ─── Showroom location map (Leaflet) ─────────────────────────────────────────
// A lightweight, styled Leaflet map for the Contact page: greyscale Carto tiles +
// square sage markers matching the design language. Pins are at SUBURB CENTROIDS
// (never a street address). Selecting a marker calls onSelect; the selected pin is
// emphasised and panned into view. The state-grouped list beside it is the primary,
// fully-accessible way to choose — the map is an enhancement.
import { SAGE } from "../styles/tokens";
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { ApiLocation } from "../data/api";

// A square, brand-consistent marker (a small window mark). Larger + filled when selected.
function pin(active: boolean): L.DivIcon {
  const s = active ? 26 : 18;
  return L.divIcon({
    className: "of-pin",
    html:
      `<span style="display:block;width:${s}px;height:${s}px;border:2px solid ${SAGE};` +
      `background:${active ? SAGE : "rgba(90,122,106,0.2)"};box-shadow:0 1px 5px rgba(19,19,17,0.3)"></span>`,
    iconSize: [s, s],
    iconAnchor: [s / 2, s / 2],
  });
}

export function LocationMap({ locations, selectedId, onSelect }: {
  locations: ApiLocation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Record<string, L.Marker>>({});
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Create the map once.
  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, { scrollWheelZoom: false, zoomControl: true }).setView([-25.6, 134.4], 3.4);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd", maxZoom: 18,
    }).addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; markersRef.current = {}; };
  }, []);

  // (Re)draw markers when the location set changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    Object.values(markersRef.current).forEach((m) => m.remove());
    markersRef.current = {};
    const pts: L.LatLngExpression[] = [];
    for (const loc of locations) {
      const marker = L.marker([loc.lat, loc.lng], { icon: pin(false), title: loc.displayName, alt: `${loc.displayName} showroom`, keyboard: true })
        .bindTooltip(loc.displayName, { direction: "top", offset: [0, -10] })
        .on("click", () => onSelectRef.current(loc.id))
        .addTo(map);
      markersRef.current[loc.id] = marker;
      pts.push([loc.lat, loc.lng]);
    }
    if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.4), { maxZoom: 6 });
  }, [locations]);

  // Emphasise + pan to the selected marker.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const [id, m] of Object.entries(markersRef.current)) {
      m.setIcon(pin(id === selectedId));
      if (id === selectedId) m.setZIndexOffset(1000);
    }
    const sel = selectedId ? markersRef.current[selectedId] : null;
    if (sel) map.panTo(sel.getLatLng(), { animate: true });
  }, [selectedId, locations]);

  return (
    <div
      ref={elRef}
      className="h-[320px] md:h-[420px] w-full border border-black/10 bg-bone"
      role="application"
      aria-label="Map of showroom locations"
    />
  );
}
