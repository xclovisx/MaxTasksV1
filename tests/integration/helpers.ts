import { db } from '../../src/lib/db/client';

export async function leegDatabase(): Promise<void> {
  await db()`truncate taak_historie, taken, herhalingen, borden, sessies, gebruikers, bedrijven restart identity cascade`;
}
