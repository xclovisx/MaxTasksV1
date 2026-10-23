import type { Context } from '../context';
import { db, transactie, type Tx } from '../db/client';
import { meldWijziging } from '../db/gebeurtenissen';
import { type Datum, vandaagInAmsterdam } from '../domein/datums';
import type { HerhalingType } from '../domein/herhaling';
import { type Prioriteit, type Status, vergelijkTaken } from '../domein/taak';
import {
  isUuid, nieuweTaakSchema, statusSchema, taakVeldenSchema, type NieuweTaakInvoer, type TaakVeldenInvoer,
} from '../domein/validatie';
import { Conflict, GeenToegang, NietGevonden } from '../fouten';
import { bordInTx } from './borden';
import { maakReeks } from './herhalingen';
import { meldUrgenteTaak } from './meldingen';
import { bewaarNieuweLocaties, haalStops, schrijfStops, type Stop, stopsTekst, telGebruik } from './stops';

export type Taak = {
  id: string;
  bordId: string;
  titel: string;
  omschrijving: string;
  datum: Datum;
  tijd: string | null;
  prioriteit: Prioriteit;
  status: Status;
  oorspronkelijkeDatum: Datum;
  uitgesteldVan: Datum | null;
  gemist: boolean;
  herhalingId: string | null;
  afwijkend: boolean;
  versie: number;
  aangemaaktOp: Date;
  gewijzigdOp: Date;
  klaarOp: Date | null;
  aangemaaktDoorNaam: string | null;
  gewijzigdDoorNaam: string | null;
  herhalingType: HerhalingType | null;
  herhalingWeekdagen: number[] | null;
  herhalingInterval: number | null;
  bordNaam: string;
  bordGearchiveerd: boolean;
  stops: Stop[];
};

export type HistorieRegel = { tijdstip: Date; naam: string | null; wijzigingen: Record<string, { oud: unknown; nieuw: unknown }> };

const plat = <T extends object>(rijen: readonly T[]): T[] => rijen.map((r) => ({ ...r }));
const NIET_GEVONDEN = 'Taak niet gevonden';

export async function takenVoorPeriode(bordId: string, van: Datum, tot: Datum): Promise<Taak[]> {
  if (!isUuid(bordId)) return [];
  const rijen = await db()<Taak[]>`
    select * from taken_weergave where bord_id = ${bordId} and datum between ${van} and ${tot}`;
  return plat(rijen).sort((a, b) => a.datum.localeCompare(b.datum) || vergelijkTaken(a, b));
}

export async function takenOpDatum(datum: Datum): Promise<Taak[]> {
  const rijen = await db()<Taak[]>`
    select * from taken_weergave where datum = ${datum} and not bord_gearchiveerd`;
  return plat(rijen).sort(vergelijkTaken);
}

export async function haalTaak(id: string): Promise<Taak> {
  if (!isUuid(id)) throw new NietGevonden(NIET_GEVONDEN);
  const [t] = await db()<Taak[]>`select * from taken_weergave where id = ${id}`;
  if (!t) throw new NietGevonden(NIET_GEVONDEN);
  return { ...t };
}

export async function taakHistorie(id: string): Promise<HistorieRegel[]> {
  if (!isUuid(id)) throw new NietGevonden(NIET_GEVONDEN);
  const rijen = await db()<HistorieRegel[]>`
    select h.tijdstip, g.naam, h.wijzigingen
    from taak_historie h left join gebruikers g on g.id = h.gebruiker_id
    where h.taak_id = ${id}
    order by h.tijdstip desc, h.id desc`;
  return plat(rijen);
}

export async function maakTaak(ctx: Context, invoer: NieuweTaakInvoer, vandaag: Datum = vandaagInAmsterdam()): Promise<{ id: string }> {
  const v = nieuweTaakSchema.parse(invoer);
  const resultaat = await transactie(async (tx) => {
    const bord = await bordInTx(tx, v.bordId);
    const stops = await bewaarNieuweLocaties(tx, v.stops);
    await telGebruik(tx, stops.map((s) => s.locatieId));
    if (v.herhaling) {
      const id = await maakReeks(tx, ctx.gebruikerId, bord, { ...v, stops }, v.herhaling, vandaag);
      await meldWijziging(tx, bord.id);
      return { id };
    }
    const [t] = await tx<{ id: string }[]>`
      insert into taken (bord_id, titel, omschrijving, datum, tijd, prioriteit, oorspronkelijke_datum, aangemaakt_door, gewijzigd_door)
      values (${bord.id}, ${v.titel}, ${v.omschrijving}, ${v.datum}, ${v.tijd}, ${v.prioriteit}, ${v.datum},
              ${ctx.gebruikerId}, ${ctx.gebruikerId})
      returning id`;
    await schrijfStops(tx, t.id, stops);
    await meldWijziging(tx, bord.id);
    return { id: t.id };
  });
  await meldUrgenteTaak(ctx, null, v);
  return resultaat;
}

type Vergrendeld = {
  id: string;
  bordId: string;
  titel: string;
  omschrijving: string;
  datum: Datum;
  tijd: string | null;
  prioriteit: Prioriteit;
  status: Status;
  versie: number;
  herhalingId: string | null;
  gewijzigdDoorNaam: string | null;
};

async function vergrendel(tx: Tx, id: string, versie: number): Promise<Vergrendeld> {
  if (!isUuid(id)) throw new NietGevonden(NIET_GEVONDEN);
  const [t] = await tx<Vergrendeld[]>`
    select t.id, t.bord_id, t.titel, t.omschrijving, t.datum, to_char(t.tijd, 'HH24:MI') as tijd, t.prioriteit,
           t.status, t.versie, t.herhaling_id, g.naam as gewijzigd_door_naam
    from taken t left join gebruikers g on g.id = t.gewijzigd_door
    where t.id = ${id}
    for update of t`;
  if (!t) throw new NietGevonden(NIET_GEVONDEN);
  if (t.versie !== versie) throw new Conflict(t.gewijzigdDoorNaam);
  return t;
}

const GEVOLGD = ['titel', 'omschrijving', 'datum', 'tijd', 'prioriteit', 'status', 'stops'] as const;

export function verschillen(oud: object, nieuw: object): Record<string, { oud: unknown; nieuw: unknown }> {
  const o = oud as Record<string, unknown>;
  const n = nieuw as Record<string, unknown>;
  const uit: Record<string, { oud: unknown; nieuw: unknown }> = {};
  for (const veld of GEVOLGD) {
    if (!(veld in n)) continue;
    const a = o[veld] ?? null;
    const b = n[veld] ?? null;
    if (a !== b) uit[veld] = { oud: a, nieuw: b };
  }
  return uit;
}

async function logWijzigingen(tx: Tx, taakId: string, gebruikerId: string, oud: object, nieuw: object): Promise<void> {
  const w = verschillen(oud, nieuw);
  if (Object.keys(w).length === 0) return;
  await tx`insert into taak_historie (taak_id, gebruiker_id, wijzigingen) values (${taakId}, ${gebruikerId}, ${JSON.stringify(w)}::text::jsonb)`;
}

export async function wijzigTaak(ctx: Context, id: string, versie: number, invoer: TaakVeldenInvoer): Promise<void> {
  const v = taakVeldenSchema.parse(invoer);
  const vorig = await transactie(async (tx) => {
    const oud = await vergrendel(tx, id, versie);
    const oudeStops = await haalStops(tx, id);
    const stops = await bewaarNieuweLocaties(tx, v.stops);
    const alGekoppeld = new Set(oudeStops.map((s) => s.locatieId));
    await telGebruik(tx, stops.map((s) => s.locatieId).filter((l) => !alGekoppeld.has(l)));
    const anderedag = oud.datum !== v.datum;
    await tx`
      update taken set
        titel = ${v.titel}, omschrijving = ${v.omschrijving}, datum = ${v.datum}, tijd = ${v.tijd}, prioriteit = ${v.prioriteit},
        afwijkend = (herhaling_id is not null),
        uitgesteld_van = case when ${anderedag} then null else uitgesteld_van end,
        gemist = case when ${anderedag} then false else gemist end,
        versie = versie + 1, gewijzigd_door = ${ctx.gebruikerId}, gewijzigd_op = now()
      where id = ${id}`;
    await schrijfStops(tx, id, stops);
    await logWijzigingen(tx, id, ctx.gebruikerId, { ...oud, stops: stopsTekst(oudeStops) }, { ...v, stops: stopsTekst(stops) });
    await meldWijziging(tx, oud.bordId);
    return { prioriteit: oud.prioriteit, bordId: oud.bordId };
  });
  await meldUrgenteTaak(ctx, vorig.prioriteit, { ...v, bordId: vorig.bordId });
}

export async function verplaatsTaak(ctx: Context, id: string, versie: number, datum: Datum): Promise<void> {
  const nieuweDatum = taakVeldenSchema.shape.datum.parse(datum);
  await transactie(async (tx) => {
    const oud = await vergrendel(tx, id, versie);
    await tx`
      update taken set
        datum = ${nieuweDatum}, afwijkend = (herhaling_id is not null), uitgesteld_van = null, gemist = false,
        versie = versie + 1, gewijzigd_door = ${ctx.gebruikerId}, gewijzigd_op = now()
      where id = ${id}`;
    await logWijzigingen(tx, id, ctx.gebruikerId, oud, { datum: nieuweDatum });
    await meldWijziging(tx, oud.bordId);
  });
}

export async function zetStatus(ctx: Context, id: string, versie: number, status: Status): Promise<void> {
  if (ctx.rol !== 'beheerder') throw new GeenToegang('Alleen de beheerder kan de status wijzigen.');
  const s = statusSchema.parse(status);
  await transactie(async (tx) => {
    const oud = await vergrendel(tx, id, versie);
    await tx`
      update taken set
        status = ${s}, klaar_op = case when ${s} = 'klaar' then now() else null end,
        versie = versie + 1, gewijzigd_door = ${ctx.gebruikerId}, gewijzigd_op = now()
      where id = ${id}`;
    await logWijzigingen(tx, id, ctx.gebruikerId, oud, { status: s });
    await meldWijziging(tx, oud.bordId);
  });
}

export async function verwijderTaak(_ctx: Context, id: string): Promise<void> {
  if (!isUuid(id)) throw new NietGevonden(NIET_GEVONDEN);
  await transactie(async (tx) => {
    const [t] = await tx<{ bordId: string }[]>`delete from taken where id = ${id} returning bord_id`;
    if (!t) throw new NietGevonden(NIET_GEVONDEN);
    await meldWijziging(tx, t.bordId);
  });
}
