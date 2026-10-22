import type { Context } from '../context';
import { db, type Tx } from '../db/client';
import { bordNaamSchema, isUuid } from '../domein/validatie';
import { NietGevonden } from '../fouten';
import { vereisBeheerder } from './rechten';

export type Bord = { id: string; naam: string; gearchiveerd: boolean };

export async function lijstBorden(opties: { metGearchiveerd?: boolean } = {}): Promise<Bord[]> {
  const rijen = await db()<Bord[]>`
    select id, naam, gearchiveerd from borden
    where (${opties.metGearchiveerd ?? false} or not gearchiveerd)
    order by naam`;
  return rijen.map((r) => ({ ...r }));
}

export async function haalBord(id: string): Promise<Bord> {
  if (!isUuid(id)) throw new NietGevonden('Bord niet gevonden');
  const [b] = await db()<Bord[]>`select id, naam, gearchiveerd from borden where id = ${id}`;
  if (!b) throw new NietGevonden('Bord niet gevonden');
  return { ...b };
}

/** Voor gebruik binnen een bestaande transactie. Gearchiveerde borden tellen niet mee. */
export async function bordInTx(tx: Tx, id: string): Promise<{ id: string }> {
  if (!isUuid(id)) throw new NietGevonden('Bord niet gevonden');
  const [b] = await tx<{ id: string }[]>`select id from borden where id = ${id} and not gearchiveerd`;
  if (!b) throw new NietGevonden('Bord niet gevonden');
  return { id: b.id };
}

export async function maakBord(ctx: Context, naam: string): Promise<{ id: string }> {
  vereisBeheerder(ctx);
  const n = bordNaamSchema.parse(naam);
  const [b] = await db()<{ id: string }[]>`insert into borden (naam) values (${n}) returning id`;
  return { id: b.id };
}

export async function wijzigBord(ctx: Context, id: string, invoer: { naam: string; gearchiveerd: boolean }): Promise<void> {
  vereisBeheerder(ctx);
  const n = bordNaamSchema.parse(invoer.naam);
  if (!isUuid(id)) throw new NietGevonden('Bord niet gevonden');
  const rijen = await db()`update borden set naam = ${n}, gearchiveerd = ${invoer.gearchiveerd} where id = ${id} returning id`;
  if (rijen.length === 0) throw new NietGevonden('Bord niet gevonden');
}
