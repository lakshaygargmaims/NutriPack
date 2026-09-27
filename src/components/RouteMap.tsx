'use client';

import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Default Leaflet marker icons break under bundlers — use OSM CDN assets.
const icon = (color: string) =>
  L.icon({
    iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });

export interface RoutePoint {
  lat: number;
  lon: number;
  name: string;
}

export default function RouteMap({
  origin,
  destination,
  geometry,
}: {
  origin: RoutePoint;
  destination: RoutePoint;
  geometry: [number, number][];
}) {
  const center = useMemo<[number, number]>(() => [(origin.lat + destination.lat) / 2, (origin.lon + destination.lon) / 2], [origin, destination]);

  return (
    <MapContainer center={center} zoom={5} scrollWheelZoom={false} className="h-[380px] w-full rounded-xl z-0">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · routing via OSRM'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={[origin.lat, origin.lon]} icon={icon('green')}>
        <Popup>
          <strong>Origin:</strong> {origin.name}
        </Popup>
      </Marker>
      <Marker position={[destination.lat, destination.lon]} icon={icon('red')}>
        <Popup>
          <strong>Destination:</strong> {destination.name}
        </Popup>
      </Marker>
      {geometry.length > 1 && (
        <Polyline positions={geometry} pathOptions={{ color: '#16a34a', weight: 4, opacity: 0.8 }}>
          <Popup>Modelled route line</Popup>
        </Polyline>
      )}
      <FitBounds geometry={geometry} />
    </MapContainer>
  );
}

function FitBounds({ geometry }: { geometry: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (geometry.length > 1) {
      map.fitBounds(L.latLngBounds(geometry).pad(0.15));
    }
  }, [geometry, map]);
  return null;
}
