import type { Context } from '../context';
import { db } from '../db/client';
import type { Datum } from '../domein/datums';
import { isUrgentVerhoogd, urgentBericht } from '../domein/meldingen';
import type { Prioriteit } from '../domein/taak';
import { ntfyOnderwerpSchema } from '../domein/validatie';
import { NtfyNietIngesteld, ntfyServer, stuurNtfy } from '../meldingen/ntfy';
import { vereisBeheerder } from './rechten';

export type UrgenteTaak = { titel: string; prioriteit: Prioriteit; bordId: string; datum: Datum; tijd: string | null };

const appUrl = () => (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

export async function haalNtfyOnderwerp(): Promise<string | null> {
  const [i] = await db()<{ ntfyOnderwerp: string | null }[]>`select ntfy_onderwerp from instellingen`;
  return i.ntfyOnderwerp;
}

export async function wijzigNtfyOnderwerp(ctx: Context, onderwerp: string): Promise<void> {
  vereisBeheerder(ctx);
  const v = ntfyOnderwerpSchema.parse(onderwerp);
  await db()`update instellingen set ntfy_onderwerp = ${v}`;
}

/** Pusht naar de beheerder als een medewerker een taak met zsm/nu maakt of de prioriteit daarnaar verhoogt. Gooit nooit: een storing wordt gelogd. */
export async function meldUrgenteTaak(ctx: Context, oud: Prioriteit | null, t: UrgenteTaak, haal: typeof fetch = fetch): Promise<void> {
  if (ctx.rol === 'beheerder' || !isUrgentVerhoogd(oud, t.prioriteit)) return; // de beheerder hoeft zichzelf niet te melden
  try {
    const onderwerp = await haalNtfyOnderwerp();
    if (!onderwerp || !ntfyServer()) return;
    const [bord] = await db()<{ naam: string }[]>`select naam from borden where id = ${t.bordId}`;
    await stuurNtfy(onderwerp, urgentBericht({ ...t, bordNaam: bord?.naam ?? 'Takenbord' }, appUrl()), haal);
  } catch (e) {
    console.error('[ntfy] melding versturen mislukt', e);
  }
}

export async function stuurTestmelding(ctx: Context, haal: typeof fetch = fetch): Promise<void> {
  vereisBeheerder(ctx);
  const onderwerp = await haalNtfyOnderwerp();
  if (!onderwerp) throw new NtfyNietIngesteld();
  await stuurNtfy(
    onderwerp,
    { titel: 'Testmelding', tekst: 'Meldingen van het takenbord werken.', prioriteit: 4, tags: ['white_check_mark'], link: `${appUrl()}/vandaag` },
    haal,
  );
}
