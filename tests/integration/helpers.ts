import { maakBeheerder } from '../../src/lib/auth/accounts';
import { hashWachtwoord } from '../../src/lib/auth/wachtwoord';
import type { Context } from '../../src/lib/context';
import { db, pgIntArray } from '../../src/lib/db/client';

export async function leegDatabase(): Promise<void> {
  await db()`truncate bijlagen, afwezigheden, taak_historie, taak_stops, taken, herhalingen, borden, sessies, gebruikers, locaties restart identity cascade`;
  await db()`update instellingen set naam = 'Garage', garage_adres = null, garage_lat = null, garage_lng = null, werkdagen = '{1,2,3,4,5}', ntfy_onderwerp = null`;
}

export async function maakBeheerderCtx(): Promise<Context> {
  const id = await maakBeheerder('Max', 'max', 'beheer-wachtwoord');
  return { gebruikerId: id, rol: 'beheerder' };
}

export async function maakBord(naam = 'Takenbord'): Promise<string> {
  const [bord] = await db()<{ id: string }[]>`insert into borden (naam) values (${naam}) returning id`;
  return bord.id;
}

export async function zetWerkdagen(werkdagen: number[]): Promise<void> {
  await db()`update instellingen set werkdagen = ${pgIntArray(werkdagen)}::int[]`;
}

export async function maakMedewerkerCtx(
  gebruikersnaam: string,
  naam = gebruikersnaam,
  wachtwoord = 'medewerker-wachtwoord',
): Promise<Context> {
  const [g] = await db()<{ id: string }[]>`insert into gebruikers (naam, gebruikersnaam, wachtwoord_hash, rol)
    values (${naam}, ${gebruikersnaam}, ${await hashWachtwoord(wachtwoord)}, 'medewerker') returning id`;
  return { gebruikerId: g.id, rol: 'medewerker' };
}
