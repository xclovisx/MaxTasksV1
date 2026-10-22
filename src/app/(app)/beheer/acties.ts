'use server';

import { wijzigEigenWachtwoord } from '@/lib/auth/accounts';
import type { Activatie } from '@/lib/auth/activatie';
import { maakBord, wijzigBord } from '@/lib/diensten/borden';
import { wijzigInstellingen } from '@/lib/diensten/instellingen';
import { maakMedewerker, nieuweActivatie, zetActief } from '@/lib/diensten/medewerkers';
import { Ongeldig } from '@/lib/fouten';
import { type ActieResultaat, type ActivatieWeergave, voerUit } from '@/lib/web/actie';
import { contextVan, vereisBeheerderSessie } from '@/lib/web/huidige-gebruiker';

const tekst = (f: FormData, k: string) => String(f.get(k) ?? '');

async function ctx() {
  return contextVan(await vereisBeheerderSessie());
}

function weergave(a: Activatie): ActivatieWeergave {
  const basis = process.env.APP_URL ?? 'http://localhost:3000';
  return { link: `${basis}/activeren/${a.token}`, code: a.code, verlooptOp: a.verlooptOp.toISOString() };
}

export async function wijzigInstellingenActie(f: FormData): Promise<ActieResultaat> {
  const getal = (k: string) => (tekst(f, k) === '' ? null : Number(tekst(f, k)));
  return voerUit(async () => {
    await wijzigInstellingen(await ctx(), {
      naam: tekst(f, 'naam'),
      garageAdres: tekst(f, 'garageAdres'),
      garageLat: getal('garageLat'),
      garageLng: getal('garageLng'),
      werkdagen: f.getAll('werkdagen').map(Number),
    });
    return null;
  });
}

export async function maakBordActie(f: FormData): Promise<ActieResultaat> {
  return voerUit(async () => {
    await maakBord(await ctx(), tekst(f, 'naam'));
    return null;
  });
}

export async function wijzigBordActie(id: string, f: FormData): Promise<ActieResultaat> {
  return voerUit(async () => {
    await wijzigBord(await ctx(), id, { naam: tekst(f, 'naam'), gearchiveerd: f.get('gearchiveerd') === 'on' });
    return null;
  });
}

export async function maakMedewerkerActie(f: FormData): Promise<ActieResultaat<ActivatieWeergave>> {
  return voerUit(async () => {
    const r = await maakMedewerker(await ctx(), { naam: tekst(f, 'naam'), gebruikersnaam: tekst(f, 'gebruikersnaam') });
    return weergave(r.activatie);
  });
}

export async function nieuweLinkActie(gebruikerId: string): Promise<ActieResultaat<ActivatieWeergave>> {
  return voerUit(async () => weergave(await nieuweActivatie(await ctx(), gebruikerId)));
}

export async function zetActiefActie(gebruikerId: string, actief: boolean): Promise<ActieResultaat> {
  return voerUit(async () => {
    await zetActief(await ctx(), gebruikerId, actief);
    return null;
  });
}

export async function wijzigWachtwoordActie(f: FormData): Promise<ActieResultaat> {
  return voerUit(async () => {
    const g = await vereisBeheerderSessie();
    if (tekst(f, 'nieuw') !== tekst(f, 'herhaal')) throw new Ongeldig('De nieuwe wachtwoorden zijn niet gelijk.');
    await wijzigEigenWachtwoord(g.id, tekst(f, 'huidig'), tekst(f, 'nieuw'));
    return null;
  });
}
