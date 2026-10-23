import type { Context } from '../context';
import { db, pgIntArray } from '../db/client';
import { meldAfwezigheidGewijzigd } from '../db/gebeurtenissen';
import {
  type Afwezigheid, afwezigheidsDagen, afwezigheidWaarschuwing as waarschuwingTekst, vergelijkAfwezigheden,
} from '../domein/afwezigheid';
import { type Datum, isGeldigeDatum } from '../domein/datums';
import { afwezigheidSchema, type AfwezigheidInvoer, isUuid } from '../domein/validatie';
import { NietGevonden } from '../fouten';
import { vereisBeheerder } from './rechten';

export type AfwezighedenOverzicht = { naam: string; perDag: Record<Datum, Afwezigheid[]> };

const NIET_GEVONDEN = 'Blok niet gevonden';
const TIJD = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function lijstAfwezigheden(): Promise<Afwezigheid[]> {
  const rijen = await db()<Afwezigheid[]>`
    select id, begindatum, einddatum, hele_dag, to_char(van, 'HH24:MI') as van, to_char(tot, 'HH24:MI') as tot,
           reden, herhaling_type, weekdagen, interval_weken
    from afwezigheden
    order by begindatum, van nulls first, aangemaakt_op`;
  return rijen.map((r) => ({ ...r }));
}

async function beheerderNaam(): Promise<string> {
  const [g] = await db()<{ naam: string }[]>`select naam from gebruikers where rol = 'beheerder' order by aangemaakt_op limit 1`;
  return g?.naam ?? 'De beheerder';
}

export async function afwezighedenInPeriode(van: Datum, tot: Datum): Promise<AfwezighedenOverzicht> {
  const [naam, blokken] = await Promise.all([beheerderNaam(), lijstAfwezigheden()]);
  const perDag: Record<Datum, Afwezigheid[]> = {};
  for (const b of blokken) {
    for (const d of afwezigheidsDagen(b, van, tot)) (perDag[d] ??= []).push(b);
  }
  for (const lijst of Object.values(perDag)) lijst.sort(vergelijkAfwezigheden);
  return { naam, perDag };
}

/** Invoer komt van de browser: een ongeldige datum geeft geen waarschuwing, een ongeldige tijd telt als "geen tijd". */
export async function afwezigheidWaarschuwing(datum: string, tijd: string | null): Promise<string | null> {
  if (!isGeldigeDatum(datum)) return null;
  const { naam, perDag } = await afwezighedenInPeriode(datum, datum);
  return waarschuwingTekst(naam, perDag[datum] ?? [], tijd && TIJD.test(tijd) ? tijd : null);
}

function herhaalKolommen(h: { type: Afwezigheid['herhalingType'] & string; weekdagen: number[]; intervalWeken: number } | null) {
  return {
    type: h?.type ?? null,
    weekdagen: pgIntArray(h?.type === 'weekdagen' ? h.weekdagen : []),
    interval: h?.type === 'elke_x_weken' ? h.intervalWeken : 1,
  };
}

export async function maakAfwezigheid(ctx: Context, invoer: AfwezigheidInvoer): Promise<{ id: string }> {
  vereisBeheerder(ctx);
  const v = afwezigheidSchema.parse(invoer);
  const h = herhaalKolommen(v.herhaling);
  const [r] = await db()<{ id: string }[]>`
    insert into afwezigheden (begindatum, einddatum, hele_dag, van, tot, reden, herhaling_type, weekdagen, interval_weken, aangemaakt_door)
    values (${v.begindatum}, ${v.einddatum}, ${v.heleDag}, ${v.van}, ${v.tot}, ${v.reden}, ${h.type},
            ${h.weekdagen}::int[], ${h.interval}, ${ctx.gebruikerId})
    returning id`;
  await meldAfwezigheidGewijzigd();
  return { id: r.id };
}

export async function wijzigAfwezigheid(ctx: Context, id: string, invoer: AfwezigheidInvoer): Promise<void> {
  vereisBeheerder(ctx);
  if (!isUuid(id)) throw new NietGevonden(NIET_GEVONDEN);
  const v = afwezigheidSchema.parse(invoer);
  const h = herhaalKolommen(v.herhaling);
  const rijen = await db()`
    update afwezigheden set
      begindatum = ${v.begindatum}, einddatum = ${v.einddatum}, hele_dag = ${v.heleDag}, van = ${v.van}, tot = ${v.tot},
      reden = ${v.reden}, herhaling_type = ${h.type}, weekdagen = ${h.weekdagen}::int[], interval_weken = ${h.interval}
    where id = ${id}
    returning id`;
  if (rijen.length === 0) throw new NietGevonden(NIET_GEVONDEN);
  await meldAfwezigheidGewijzigd();
}

export async function verwijderAfwezigheid(ctx: Context, id: string): Promise<void> {
  vereisBeheerder(ctx);
  if (!isUuid(id)) throw new NietGevonden(NIET_GEVONDEN);
  const rijen = await db()`delete from afwezigheden where id = ${id} returning id`;
  if (rijen.length === 0) throw new NietGevonden(NIET_GEVONDEN);
  await meldAfwezigheidGewijzigd();
}
