import type { Context } from '../context';
import { db, pgIntArray } from '../db/client';
import { instellingenSchema, type InstellingenInvoer } from '../domein/validatie';
import { vereisBeheerder } from './rechten';

export type Instellingen = { naam: string; garageAdres: string | null; werkdagen: number[] };

export async function haalInstellingen(): Promise<Instellingen> {
  const [i] = await db()<Instellingen[]>`select naam, garage_adres, werkdagen from instellingen`;
  return { ...i };
}

export async function wijzigInstellingen(ctx: Context, invoer: InstellingenInvoer): Promise<void> {
  vereisBeheerder(ctx);
  const v = instellingenSchema.parse(invoer);
  await db()`
    update instellingen set naam = ${v.naam}, garage_adres = ${v.garageAdres}, werkdagen = ${pgIntArray(v.werkdagen)}::int[]`;
}
