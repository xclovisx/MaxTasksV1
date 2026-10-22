import { db, type Db, type Tx } from '../../lib/db/client';
import { type Datum, vandaagInAmsterdam } from '../../lib/domein/datums';
import { genereerExemplaren } from '../../lib/diensten/herhalingen';

type Generator = (tx: Tx, herhalingId: string, vandaag: Datum) => Promise<number>;

/** Vult alle actieve reeksen (van niet-gearchiveerde borden) aan; één mislukte reeks houdt de rest niet tegen. */
export async function genereerAlleHerhalingen(
  sql: Db = db(),
  vandaag: Datum = vandaagInAmsterdam(),
  genereer: Generator = genereerExemplaren,
): Promise<number> {
  const reeksen = await sql<{ id: string }[]>`
    select h.id from herhalingen h
    join borden b on b.id = h.bord_id
    where h.actief and not b.gearchiveerd`;
  let totaal = 0;
  for (const { id } of reeksen) {
    try {
      totaal += (await sql.begin((tx) => genereer(tx, id, vandaag))) as number;
    } catch (e) {
      console.error(`[worker] reeks ${id} mislukt`, e);
    }
  }
  return totaal;
}
