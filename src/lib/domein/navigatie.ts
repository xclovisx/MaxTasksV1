export type Punt = { lat: number; lng: number };

const coord = (p: Punt) => encodeURIComponent(`${p.lat},${p.lng}`);

export function navigatieUrl(p: Punt): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${coord(p)}&travelmode=driving`;
}

/** Google Maps-link langs meerdere stops. Zonder start kiest Maps de huidige locatie; zonder bestemming eindigt de rit bij de laatste stop. */
export function routeUrl(r: { start: Punt | null; bestemming: Punt | null; stops: Punt[] }): string {
  const tussen = [...r.stops];
  const bestemming = r.bestemming ?? tussen.pop();
  if (!bestemming) throw new Error('Een route heeft minstens één stop of bestemming nodig');
  const delen = ['api=1'];
  if (r.start) delen.push(`origin=${coord(r.start)}`);
  delen.push(`destination=${coord(bestemming)}`);
  if (tussen.length > 0) delen.push(`waypoints=${tussen.map(coord).join('%7C')}`);
  delen.push('travelmode=driving');
  return `https://www.google.com/maps/dir/?${delen.join('&')}`;
}

export function stopsSamenvatting(stops: { naam: string }[]): string | null {
  if (stops.length === 0) return null;
  if (stops.length === 1) return stops[0].naam;
  return `${stops.length} stops`;
}

export function formatDuur(sec: number): string {
  const min = Math.round(sec / 60);
  if (min < 1) return '< 1 min';
  if (min < 60) return `${min} min`;
  const rest = min % 60;
  return rest === 0 ? `${Math.floor(min / 60)} u` : `${Math.floor(min / 60)} u ${rest} min`;
}

export function formatAfstand(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}
