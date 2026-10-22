'use server';

import { hernoemLocatie, type Locatie, lijstLocaties, maakLocatie, vaakGebruikteLocaties, verwijderLocatie } from '@/lib/diensten/locaties';
import type { LocatieInvoer } from '@/lib/domein/validatie';
import { type Plaats, plaatsDetails, type Suggestie, zoekPlaatsen } from '@/lib/google/plaatsen';
import { type ActieResultaat, voerUit } from '@/lib/web/actie';
import { contextVan, vereisGebruiker } from '@/lib/web/huidige-gebruiker';

async function ctx() {
  return contextVan(await vereisGebruiker());
}

export async function zoekPlaatsenActie(invoer: string, sessie: string): Promise<ActieResultaat<Suggestie[]>> {
  return voerUit(async () => {
    await ctx();
    return zoekPlaatsen(invoer, sessie);
  });
}

export async function plaatsDetailsActie(placeId: string, sessie: string): Promise<ActieResultaat<Plaats>> {
  return voerUit(async () => {
    await ctx();
    return plaatsDetails(placeId, sessie);
  });
}

export async function locatieOverzichtActie(): Promise<ActieResultaat<{ alle: Locatie[]; vaak: Locatie[] }>> {
  return voerUit(async () => {
    await ctx();
    const [alle, vaak] = await Promise.all([lijstLocaties(), vaakGebruikteLocaties()]);
    return { alle, vaak };
  });
}

export async function maakLocatieActie(invoer: LocatieInvoer): Promise<ActieResultaat<string>> {
  return voerUit(async () => (await maakLocatie(await ctx(), invoer)).id);
}

export async function hernoemLocatieActie(id: string, f: FormData): Promise<ActieResultaat> {
  return voerUit(async () => {
    await hernoemLocatie(await ctx(), id, String(f.get('naam') ?? ''));
    return null;
  });
}

export async function verwijderLocatieActie(id: string): Promise<ActieResultaat> {
  return voerUit(async () => {
    await verwijderLocatie(await ctx(), id);
    return null;
  });
}
