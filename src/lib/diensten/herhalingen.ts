import type { Context } from '../context';
import { pgIntArray, transactie, type Tx } from '../db/client';
import { meldWijziging } from '../db/gebeurtenissen';
import { type Datum, plusDagen, vandaagInAmsterdam } from '../domein/datums';
import { datumsVoorHerhaling, type HerhalingType } from '../domein/herhaling';
import type { Prioriteit } from '../domein/taak';
import { isUuid, reeksSchema, type HerhalingInvoer, type ReeksInvoer } from '../domein/validatie';
import { NietGevonden } from '../fouten';

export const HORIZON_DAGEN = 14;

type HerhalingRij = {
  id: string;
  bordId: string;
  titel: string;
  omschrijving: string;
  tijd: string | null;
  prioriteit: Prioriteit;
  type: HerhalingType;
  weekdagen: number[];
  intervalWeken: number;
  startdatum: Datum;
  gegenereerdTot: Datum | null;
  actief: boolean;
  aangemaaktDoor: string | null;
  werkdagen: number[];
};

const laterVan = (a: Datum, b: Datum): Datum => (a > b ? a : b);

export async function genereerExemplaren(tx: Tx, herhalingId: string, vandaag: Datum): Promise<number> {
  const [h] = await tx<HerhalingRij[]>`
    select h.id, h.bord_id, h.titel, h.omschrijving, h.tijd, h.prioriteit, h.type, h.weekdagen,
           h.interval_weken, h.startdatum, h.gegenereerd_tot, h.actief, h.aangemaakt_door,
           (select werkdagen from instellingen) as werkdagen
    from herhalingen h
    where h.id = ${herhalingId}
    for update of h`;
  if (!h || !h.actief) return 0;
  const tot = plusDagen(laterVan(h.startdatum, vandaag), HORIZON_DAGEN - 1);
  const van = h.gegenereerdTot ? laterVan(plusDagen(h.gegenereerdTot, 1), vandaag) : h.startdatum;
  if (van > tot) return 0;
  const datums = datumsVoorHerhaling(
    { type: h.type, weekdagen: h.weekdagen, intervalWeken: h.intervalWeken, startdatum: h.startdatum },
    van, tot, h.werkdagen,
  );
  let aantal = 0;
  for (const d of datums) {
    const r = await tx`
      insert into taken (bord_id, titel, omschrijving, datum, tijd, prioriteit, oorspronkelijke_datum,
                         herhaling_id, aangemaakt_door, gewijzigd_door)
      values (${h.bordId}, ${h.titel}, ${h.omschrijving}, ${d}, ${h.tijd}, ${h.prioriteit}, ${d},
              ${h.id}, ${h.aangemaaktDoor}, ${h.aangemaaktDoor})
      on conflict (herhaling_id, oorspronkelijke_datum) where herhaling_id is not null do nothing
      returning id`;
    aantal += r.length;
  }
  await tx`update herhalingen set gegenereerd_tot = ${tot} where id = ${h.id}`;
  if (aantal > 0) await meldWijziging(tx, h.bordId);
  return aantal;
}

export async function maakReeks(
  tx: Tx,
  gebruikerId: string,
  bord: { id: string },
  velden: { titel: string; omschrijving: string; datum: Datum; tijd: string | null; prioriteit: Prioriteit },
  regel: HerhalingInvoer,
  vandaag: Datum,
): Promise<string> {
  const [h] = await tx<{ id: string }[]>`
    insert into herhalingen (bord_id, titel, omschrijving, tijd, prioriteit, type, weekdagen, interval_weken, startdatum, aangemaakt_door)
    values (${bord.id}, ${velden.titel}, ${velden.omschrijving}, ${velden.tijd}, ${velden.prioriteit},
            ${regel.type}, ${pgIntArray(regel.weekdagen)}::int[], ${regel.intervalWeken}, ${velden.datum}, ${gebruikerId})
    returning id`;
  await genereerExemplaren(tx, h.id, vandaag);
  const [eerste] = await tx<{ id: string }[]>`select id from taken where herhaling_id = ${h.id} order by datum limit 1`;
  if (!eerste) throw new Error('Reeks leverde geen taken op');
  return eerste.id;
}

const OPEN_TOEKOMST = (tx: Tx, herhalingId: string, vandaag: Datum) => tx`
  delete from taken
  where herhaling_id = ${herhalingId} and datum >= ${vandaag} and not afwijkend and status = 'open' and uitgesteld_van is null`;

export async function wijzigReeks(ctx: Context, herhalingId: string, invoer: ReeksInvoer, vandaag: Datum = vandaagInAmsterdam()): Promise<void> {
  const v = reeksSchema.parse(invoer);
  if (!isUuid(herhalingId)) throw new NietGevonden('Reeks niet gevonden');
  await transactie(async (tx) => {
    const [h] = await tx<{ bordId: string }[]>`
      update herhalingen set
        titel = ${v.titel}, omschrijving = ${v.omschrijving}, tijd = ${v.tijd}, prioriteit = ${v.prioriteit},
        type = ${v.herhaling.type}, weekdagen = ${pgIntArray(v.herhaling.weekdagen)}::int[], interval_weken = ${v.herhaling.intervalWeken},
        gegenereerd_tot = ${plusDagen(vandaag, -1)}
      where id = ${herhalingId}
      returning bord_id`;
    if (!h) throw new NietGevonden('Reeks niet gevonden');
    await tx`
      update taken set
        titel = ${v.titel}, omschrijving = ${v.omschrijving}, tijd = ${v.tijd}, prioriteit = ${v.prioriteit},
        versie = versie + 1, gewijzigd_door = ${ctx.gebruikerId}, gewijzigd_op = now()
      where herhaling_id = ${herhalingId} and datum >= ${vandaag} and not afwijkend
        and (status = 'bezig' or (status = 'open' and uitgesteld_van is not null))`;
    await OPEN_TOEKOMST(tx, herhalingId, vandaag);
    await genereerExemplaren(tx, herhalingId, vandaag);
    await meldWijziging(tx, h.bordId);
  });
}

export async function stopReeks(_ctx: Context, herhalingId: string, vandaag: Datum = vandaagInAmsterdam()): Promise<void> {
  if (!isUuid(herhalingId)) throw new NietGevonden('Reeks niet gevonden');
  await transactie(async (tx) => {
    const [h] = await tx<{ bordId: string }[]>`update herhalingen set actief = false where id = ${herhalingId} returning bord_id`;
    if (!h) throw new NietGevonden('Reeks niet gevonden');
    await OPEN_TOEKOMST(tx, herhalingId, vandaag);
    await meldWijziging(tx, h.bordId);
  });
}
