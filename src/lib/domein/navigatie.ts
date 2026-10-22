export type Punt = { lat: number; lng: number };

export function navigatieUrl(p: Punt): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${p.lat},${p.lng}`)}&travelmode=driving`;
}

export function stopsSamenvatting(stops: { naam: string }[]): string | null {
  if (stops.length === 0) return null;
  if (stops.length === 1) return stops[0].naam;
  return `${stops.length} stops`;
}
