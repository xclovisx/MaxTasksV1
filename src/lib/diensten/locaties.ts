import type { Context } from '../context';
import { db, transactie, type Tx } from '../db/client';
import { isUuid, locatieSchema, type LocatieInvoer } from '../domein/validatie';
import { NietGevonden } from '../fouten';

export type Locatie = {
  id: string;
  naam: string;
  adres: string;
  lat: number;
  lng: number;
  googlePlaceId: string | null;
  gebruikTeller: number;
};

const NIET_GEVONDEN = 'Locatie niet gevonden';

export async function lijstLocaties(): Promise<Locatie[]> {
  const rijen = await db()<Locatie[]>`
    select id, naam, adres, lat, lng, google_place_id, gebruik_teller from locaties order by lower(naam), id`;
  return rijen.map((r) => ({ ...r }));
}

export async function vaakGebruikteLocaties(aantal = 5): Promise<Locatie[]> {
  const rijen = await db()<Locatie[]>`
    select id, naam, adres, lat, lng, google_place_id, gebruik_teller from locaties
    where gebruik_teller > 0
    order by gebruik_teller desc, lower(naam)
    limit ${aantal}`;
  return rijen.map((r) => ({ ...r }));
}

/** Slaat een locatie op; een bekende Google-plaats levert het bestaande id (naam blijft staan). */
export async function bewaarLocatie(tx: Tx, invoer: LocatieInvoer): Promise<string> {
  const v = locatieSchema.parse(invoer);
  if (v.googlePlaceId) {
    const [r] = await tx<{ id: string }[]>`
      insert into locaties (naam, adres, lat, lng, google_place_id)
      values (${v.naam}, ${v.adres}, ${v.lat}, ${v.lng}, ${v.googlePlaceId})
      on conflict (google_place_id) do update set google_place_id = excluded.google_place_id
      returning id`;
    return r.id;
  }
  const [r] = await tx<{ id: string }[]>`
    insert into locaties (naam, adres, lat, lng) values (${v.naam}, ${v.adres}, ${v.lat}, ${v.lng}) returning id`;
  return r.id;
}

export async function maakLocatie(_ctx: Context, invoer: LocatieInvoer): Promise<{ id: string }> {
  return { id: await transactie((tx) => bewaarLocatie(tx, invoer)) };
}

export async function hernoemLocatie(_ctx: Context, id: string, naam: string): Promise<void> {
  const n = locatieSchema.shape.naam.parse(naam);
  if (!isUuid(id)) throw new NietGevonden(NIET_GEVONDEN);
  const rijen = await db()`update locaties set naam = ${n} where id = ${id} returning id`;
  if (rijen.length === 0) throw new NietGevonden(NIET_GEVONDEN);
}

export async function verwijderLocatie(_ctx: Context, id: string): Promise<void> {
  if (!isUuid(id)) throw new NietGevonden(NIET_GEVONDEN);
  const rijen = await db()`delete from locaties where id = ${id} returning id`;
  if (rijen.length === 0) throw new NietGevonden(NIET_GEVONDEN);
}
