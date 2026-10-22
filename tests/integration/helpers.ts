import { db } from '../../src/lib/db/client';

export async function leegDatabase(): Promise<void> {
  await db()`truncate taak_historie, taken, herhalingen, borden, sessies, gebruikers restart identity cascade`;
  await db()`update instellingen set naam = 'Garage', garage_adres = null, werkdagen = '{1,2,3,4,5}'`;
}
