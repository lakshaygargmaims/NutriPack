/**
 * City gazetteer for Route Intelligence. Coordinates from OpenStreetMap data
 * (© OpenStreetMap contributors), rounded — approximate city-centre anchors for
 * a prototype routing demo, not survey data.
 */
export interface City {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export const CITIES: City[] = [
  { id: 'delhi', name: 'Delhi', lat: 28.61, lon: 77.21 },
  { id: 'jaipur', name: 'Jaipur', lat: 26.91, lon: 75.79 },
  { id: 'mumbai', name: 'Mumbai', lat: 19.08, lon: 72.88 },
  { id: 'pune', name: 'Pune', lat: 18.52, lon: 73.86 },
  { id: 'nashik', name: 'Nashik', lat: 20.01, lon: 73.79 },
  { id: 'ahmedabad', name: 'Ahmedabad', lat: 23.02, lon: 72.57 },
  { id: 'surat', name: 'Surat', lat: 21.17, lon: 72.83 },
  { id: 'lucknow', name: 'Lucknow', lat: 26.85, lon: 80.95 },
  { id: 'kanpur', name: 'Kanpur', lat: 26.45, lon: 80.33 },
  { id: 'varanasi', name: 'Varanasi', lat: 25.32, lon: 82.97 },
  { id: 'kolkata', name: 'Kolkata', lat: 22.57, lon: 88.36 },
  { id: 'patna', name: 'Patna', lat: 25.59, lon: 85.14 },
  { id: 'guwahati', name: 'Guwahati', lat: 26.14, lon: 91.74 },
  { id: 'bengaluru', name: 'Bengaluru', lat: 12.97, lon: 77.59 },
  { id: 'chennai', name: 'Chennai', lat: 13.08, lon: 80.27 },
  { id: 'hyderabad', name: 'Hyderabad', lat: 17.38, lon: 78.49 },
  { id: 'kochi', name: 'Kochi', lat: 9.93, lon: 76.27 },
  { id: 'coimbatore', name: 'Coimbatore', lat: 11.02, lon: 76.96 },
  { id: 'nagpur', name: 'Nagpur', lat: 21.15, lon: 79.09 },
  { id: 'bhopal', name: 'Bhopal', lat: 23.26, lon: 77.41 },
];

export function findCity(idOrName: string): City | undefined {
  const q = idOrName.trim().toLowerCase();
  return CITIES.find((c) => c.id === q || c.name.toLowerCase() === q);
}

/** Great-circle distance in km (haversine) — road distance comes from the router. */
export function haversineKm(a: City, b: City): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)));
}
