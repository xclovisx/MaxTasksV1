'use server';

import { afwezigheidWaarschuwing } from '@/lib/diensten/afwezigheden';
import { verwijderBijlage } from '@/lib/diensten/bijlagen';
import { stopReeks, wijzigReeks } from '@/lib/diensten/herhalingen';
import { planRoute, type RoutePlan } from '@/lib/diensten/route';
import {
  type HistorieRegel, maakTaak, taakHistorie, verplaatsTaak, verwijderTaak, wijzigTaak, zetStatus,
} from '@/lib/diensten/taken';
import type { Punt } from '@/lib/domein/navigatie';
import type { Status } from '@/lib/domein/taak';
import type { NieuweTaakInvoer, ReeksInvoer, TaakVeldenInvoer } from '@/lib/domein/validatie';
import { type ActieResultaat, voerUit } from '@/lib/web/actie';
import { contextVan, vereisGebruiker } from '@/lib/web/huidige-gebruiker';

async function ctx() {
  return contextVan(await vereisGebruiker());
}

export async function maakTaakActie(invoer: NieuweTaakInvoer): Promise<ActieResultaat<string>> {
  return voerUit(async () => (await maakTaak(await ctx(), invoer)).id);
}

export async function wijzigTaakActie(id: string, versie: number, invoer: TaakVeldenInvoer): Promise<ActieResultaat> {
  return voerUit(async () => { await wijzigTaak(await ctx(), id, versie, invoer); return null; });
}

export async function wijzigReeksActie(herhalingId: string, invoer: ReeksInvoer): Promise<ActieResultaat> {
  return voerUit(async () => { await wijzigReeks(await ctx(), herhalingId, invoer); return null; });
}

export async function stopReeksActie(herhalingId: string): Promise<ActieResultaat> {
  return voerUit(async () => { await stopReeks(await ctx(), herhalingId); return null; });
}

export async function verplaatsTaakActie(id: string, versie: number, datum: string): Promise<ActieResultaat> {
  return voerUit(async () => { await verplaatsTaak(await ctx(), id, versie, datum); return null; });
}

export async function zetStatusActie(id: string, versie: number, status: Status): Promise<ActieResultaat> {
  return voerUit(async () => { await zetStatus(await ctx(), id, versie, status); return null; });
}

export async function verwijderTaakActie(id: string): Promise<ActieResultaat> {
  return voerUit(async () => { await verwijderTaak(await ctx(), id); return null; });
}

export async function historieActie(id: string): Promise<ActieResultaat<HistorieRegel[]>> {
  return voerUit(async () => {
    await ctx(); // alleen ingelogde gebruikers
    return taakHistorie(id);
  });
}

export async function planRouteActie(taakId: string, start: Punt | null): Promise<ActieResultaat<RoutePlan>> {
  return voerUit(async () => {
    await ctx(); // alleen ingelogde gebruikers
    return planRoute(taakId, start);
  });
}

export async function afwezigheidWaarschuwingActie(datum: string, tijd: string | null): Promise<ActieResultaat<string | null>> {
  return voerUit(async () => {
    await ctx(); // alleen ingelogde gebruikers
    return afwezigheidWaarschuwing(datum, tijd);
  });
}

export async function verwijderBijlageActie(id: string): Promise<ActieResultaat> {
  return voerUit(async () => { await verwijderBijlage(await ctx(), id); return null; });
}
