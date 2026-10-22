import { db, type Tx } from './client';

export const KANAAL = 'bord_wijziging';

/** Wordt pas verstuurd als de transactie slaagt (Postgres NOTIFY-semantiek). */
export async function meldWijziging(tx: Tx, bordId: string): Promise<void> {
  await tx`select pg_notify(${KANAAL}, ${bordId})`;
}

export async function luisterNaarWijzigingen(fn: (bordId: string) => void): Promise<() => Promise<void>> {
  const { unlisten } = await db().listen(KANAAL, fn);
  return unlisten;
}
