import { db, type Db } from '../../lib/db/client';
import { type Datum, vandaagInAmsterdam } from '../../lib/domein/datums';
import { genereerExemplaren } from '../../lib/diensten/herhalingen';

export async function genereerAlleHerhalingen(sql: Db = db(), vandaag: Datum = vandaagInAmsterdam()): Promise<number> {
  const reeksen = await sql<{ id: string }[]>`select id from herhalingen where actief`;
  let totaal = 0;
  for (const { id } of reeksen) {
    totaal += (await sql.begin((tx) => genereerExemplaren(tx, id, vandaag))) as number;
  }
  return totaal;
}
