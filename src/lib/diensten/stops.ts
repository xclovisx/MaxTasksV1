import type { Tx } from '../db/client';
import type { StopInvoer } from '../domein/validatie';
import { bewaarLocatie } from './locaties';

export type Stop = {
  naam: string;
  adres: string;
  lat: number;
  lng: number;
  googlePlaceId: string | null;
  locatieId: string | null;
};

export async function bewaarNieuweLocaties(tx: Tx, stops: StopInvoer[]): Promise<Stop[]> {
  const uit: Stop[] = [];
  for (const s of stops) {
    const locatieId = s.locatieId ?? (s.bewaar ? await bewaarLocatie(tx, s) : null);
    uit.push({ naam: s.naam, adres: s.adres, lat: s.lat, lng: s.lng, googlePlaceId: s.googlePlaceId, locatieId });
  }
  return uit;
}

export async function schrijfStops(tx: Tx, taakId: string, stops: Stop[]): Promise<void> {
  await tx`delete from taak_stops where taak_id = ${taakId}`;
  // Stops zijn kopieen: een locatie die inmiddels verwijderd is (bijv. in een reekssjabloon) wordt een losse stop.
  const gevraagd = [...new Set(stops.map((s) => s.locatieId).filter((x): x is string => x !== null))];
  const bestaand = new Set(
    gevraagd.length > 0 ? (await tx<{ id: string }[]>`select id from locaties where id in ${tx(gevraagd)}`).map((r) => r.id) : [],
  );
  for (const [i, s] of stops.entries()) {
    const locatieId = s.locatieId !== null && bestaand.has(s.locatieId) ? s.locatieId : null;
    await tx`
      insert into taak_stops (taak_id, volgorde, naam, adres, lat, lng, google_place_id, locatie_id)
      values (${taakId}, ${i + 1}, ${s.naam}, ${s.adres}, ${s.lat}, ${s.lng}, ${s.googlePlaceId}, ${locatieId})`;
  }
}

export async function haalStops(tx: Tx, taakId: string): Promise<Stop[]> {
  const rijen = await tx<Stop[]>`
    select naam, adres, lat, lng, google_place_id, locatie_id from taak_stops where taak_id = ${taakId} order by volgorde`;
  return rijen.map((r) => ({ ...r }));
}

export async function telGebruik(tx: Tx, locatieIds: (string | null)[]): Promise<void> {
  const ids = [...new Set(locatieIds.filter((x): x is string => x !== null))];
  if (ids.length > 0) await tx`update locaties set gebruik_teller = gebruik_teller + 1 where id in ${tx(ids)}`;
}

export function stopsTekst(stops: { naam: string }[]): string {
  return stops.map((s) => s.naam).join(' → ');
}
