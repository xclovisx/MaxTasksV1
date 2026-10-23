'use server';

import { maakAfwezigheid, verwijderAfwezigheid, wijzigAfwezigheid } from '@/lib/diensten/afwezigheden';
import type { AfwezigheidInvoer } from '@/lib/domein/validatie';
import { type ActieResultaat, voerUit } from '@/lib/web/actie';
import { contextVan, vereisBeheerderSessie } from '@/lib/web/huidige-gebruiker';

async function ctx() {
  return contextVan(await vereisBeheerderSessie());
}

export async function maakAfwezigheidActie(invoer: AfwezigheidInvoer): Promise<ActieResultaat<string>> {
  return voerUit(async () => (await maakAfwezigheid(await ctx(), invoer)).id);
}

export async function wijzigAfwezigheidActie(id: string, invoer: AfwezigheidInvoer): Promise<ActieResultaat> {
  return voerUit(async () => {
    await wijzigAfwezigheid(await ctx(), id, invoer);
    return null;
  });
}

export async function verwijderAfwezigheidActie(id: string): Promise<ActieResultaat> {
  return voerUit(async () => {
    await verwijderAfwezigheid(await ctx(), id);
    return null;
  });
}
