// =============================================================================
// GeofenceMapPicker — Leaflet + OpenStreetMap picker for a single point + radius
//
// Used by the attendance settings page to pin a geofence on a real map. The
// user can:
//   • click anywhere on the map → marker jumps there → onChange fires
//   • drag the marker → onChange fires on dragend
//   • type lat/lng in the parent's number inputs → map pans to follow
//
// The radius (metres) drives a Circle overlay so the admin can see the area
// they're configuring before saving.
//
// Tiles are the public OSM tile server. No API key, no billing. Acceptable
// for low-traffic admin tooling like this; we don't ship tiles ourselves.
// If usage grows, swap in a hosted tile provider (MapTiler, Stadia, etc.)
// by changing the TileLayer `url` only.
// =============================================================================

import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Circle, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Default Leaflet icon paths break under Vite — the icons are referenced
// via CSS `url()` relative to the leaflet css file, which Vite rewrites in
// a way that loses the asset. Explicitly point the icon class at the
// imported PNG URLs and the markers render in dev + prod builds.
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

const DEFAULT_ICON = L.icon({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// Overwrite the prototype default so any Marker we render picks this up
// without each one having to set `icon=` explicitly.
(L.Marker.prototype.options as any).icon = DEFAULT_ICON;

// Geographic centre of India — sensible default when the admin hasn't
// typed any coords yet. Zooms out so most of the country is visible.
const FALLBACK_CENTER: [number, number] = [20.5937, 78.9629];
const FALLBACK_ZOOM = 5;
const POINT_ZOOM = 15;

interface Props {
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number;
  onChange: (next: { latitude: number; longitude: number }) => void;
  /** Optional fixed pixel height for the map container. Defaults to 280px. */
  height?: number;
}

export default function GeofenceMapPicker({
  latitude,
  longitude,
  radiusMeters,
  onChange,
  height = 280,
}: Props) {
  const hasPoint =
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    !Number.isNaN(latitude) &&
    !Number.isNaN(longitude);

  const center: [number, number] = hasPoint
    ? [latitude as number, longitude as number]
    : FALLBACK_CENTER;
  const initialZoom = hasPoint ? POINT_ZOOM : FALLBACK_ZOOM;

  // Memoise so MapContainer isn't re-created on every parent render. Once
  // mounted, MapContainer's center/zoom props are init-only — we pan
  // imperatively from a child via useMap() instead.
  const initialCenter = useMemo(() => center, []); // eslint-disable-line react-hooks/exhaustive-deps
  const initialZoomMemo = useMemo(() => initialZoom, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="rounded-lg overflow-hidden border border-gray-200"
      style={{ height }}
    >
      <MapContainer
        center={initialCenter}
        zoom={initialZoomMemo}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickHandler onPick={(latlng) => onChange({ latitude: latlng.lat, longitude: latlng.lng })} />
        {hasPoint && (
          <>
            <FollowPoint latitude={latitude as number} longitude={longitude as number} />
            <Marker
              position={[latitude as number, longitude as number]}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const m = e.target as L.Marker;
                  const ll = m.getLatLng();
                  onChange({ latitude: ll.lat, longitude: ll.lng });
                },
              }}
            />
            <Circle
              center={[latitude as number, longitude as number]}
              radius={Math.max(1, Number(radiusMeters) || 0)}
              pathOptions={{ color: "#0ea5e9", fillColor: "#0ea5e9", fillOpacity: 0.15 }}
            />
          </>
        )}
      </MapContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function ClickHandler({ onPick }: { onPick: (latlng: L.LatLng) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng);
    },
  });
  return null;
}

// Pan + zoom the map to follow the controlled point when the parent's
// inputs change (e.g. admin pasted in a Google Maps coord pair). We don't
// re-zoom on every change — only when the previous position was outside
// the current viewport, to avoid yanking the map mid-drag.
function FollowPoint({ latitude, longitude }: { latitude: number; longitude: number }) {
  const map = useMap();
  useEffect(() => {
    const ll = L.latLng(latitude, longitude);
    if (!map.getBounds().contains(ll)) {
      map.setView(ll, Math.max(map.getZoom(), POINT_ZOOM), { animate: true });
    }
  }, [latitude, longitude, map]);
  return null;
}
