import { randomUUID } from 'node:crypto';
import { rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Context } from '../context';
import { db, transactie, type Tx } from '../db/client';
import { meldWijziging } from '../db/gebeurtenissen';
import { herkenCode } from '../codes';
import {
  bepaalType, type Bijlage, type BijlageType, type Code, MAX_BIJLAGE_BYTES, MAX_BIJLAGEN_PER_TAAK, schoonNaam,
} from '../domein/bijlagen';
import { isUuid } from '../domein/validatie';
import { NietGevonden, Ongeldig, TeGroot, TeVeelBijlagen } from '../fouten';
import { bijlagenMap, vereisOpslag } from '../opslag';

const BIJLAGE_NIET_GEVONDEN = 'Bijlage niet gevonden';
const TAAK_NIET_GEVONDEN = 'Taak niet gevonden';

async function logBijlage(tx: Tx, taakId: string, gebruikerId: string, oud: string | null, nieuw: string | null): Promise<void> {
  const w = JSON.stringify({ bijlage: { oud, nieuw } });
  await tx`insert into taak_historie (taak_id, gebruiker_id, wijzigingen) values (${taakId}, ${gebruikerId}, ${w}::text::jsonb)`;
}

/** Schrijft eerst het bestand (via .deel) en legt dan de rij vast; mislukt dat, dan gaat het bestand weer weg. */
export async function voegBijlageToe(
  ctx: Context, taakId: string, invoer: { naam: string; inhoud: Uint8Array },
  herken: (b: Uint8Array) => Promise<Code | null> = herkenCode,
): Promise<Bijlage> {
  if (!isUuid(taakId)) throw new NietGevonden(TAAK_NIET_GEVONDEN);
  if (invoer.inhoud.length === 0) throw new Ongeldig('Het bestand is leeg.');
  if (invoer.inhoud.length > MAX_BIJLAGE_BYTES) throw new TeGroot('Te groot (max 10 MB).');
  const type = bepaalType(invoer.inhoud);
  if (!type) throw new Ongeldig("Dit bestandstype kan niet (alleen foto's en PDF's).");
  const naam = schoonNaam(invoer.naam);
  const map = bijlagenMap();
  await vereisOpslag(map);

  // Pas na de opslagcontrole: zonder schijf hoeven we geen rekentijd te verspillen. Wel vóór de transactie, die blijft kort.
  let code: Code | null = null;
  if (type !== 'application/pdf') {
    try {
      code = await herken(invoer.inhoud);
    } catch (e) {
      console.error('[bijlagen] code herkennen mislukt', e); // de upload gaat gewoon door
    }
  }

  const id = randomUUID();
  const doel = path.join(map, id);
  try {
    await writeFile(`${doel}.deel`, invoer.inhoud);
    await rename(`${doel}.deel`, doel);
  } catch (e) {
    await rm(`${doel}.deel`, { force: true });
    throw e;
  }
  try {
    await transactie(async (tx) => {
      const [t] = await tx<{ bordId: string }[]>`select bord_id from taken where id = ${taakId} for update`;
      if (!t) throw new NietGevonden(TAAK_NIET_GEVONDEN);
      const [{ aantal }] = await tx<{ aantal: number }[]>`select count(*)::int as aantal from bijlagen where taak_id = ${taakId}`;
      if (aantal >= MAX_BIJLAGEN_PER_TAAK) throw new TeVeelBijlagen(`Maximaal ${MAX_BIJLAGEN_PER_TAAK} bijlagen per taak.`);
      await tx`
        insert into bijlagen (id, taak_id, naam, type, grootte, aangemaakt_door, code_formaat, code_tekst)
        values (${id}, ${taakId}, ${naam}, ${type}, ${invoer.inhoud.length}, ${ctx.gebruikerId}, ${code?.formaat ?? null}, ${code?.tekst ?? null})`;
      // Een reekstaak met een bijlage geldt als afwijkend, zodat het wijzigen of stoppen van de reeks hem niet weggooit.
      await tx`update taken set afwijkend = (herhaling_id is not null) where id = ${taakId}`;
      await logBijlage(tx, taakId, ctx.gebruikerId, null, naam);
      await meldWijziging(tx, t.bordId);
    });
  } catch (e) {
    await rm(doel, { force: true });
    throw e;
  }
  return { id, naam, type, grootte: invoer.inhoud.length, code };
}

export async function verwijderBijlage(ctx: Context, id: string): Promise<void> {
  if (!isUuid(id)) throw new NietGevonden(BIJLAGE_NIET_GEVONDEN);
  await transactie(async (tx) => {
    const [b] = await tx<{ taakId: string; naam: string; bordId: string }[]>`
      delete from bijlagen b using taken t
      where b.id = ${id} and t.id = b.taak_id
      returning b.taak_id, b.naam, t.bord_id`;
    if (!b) throw new NietGevonden(BIJLAGE_NIET_GEVONDEN);
    await logBijlage(tx, b.taakId, ctx.gebruikerId, b.naam, null);
    await meldWijziging(tx, b.bordId);
  });
  // Lukt dit niet, dan ruimt de nachtrun het losse bestand op.
  await rm(path.join(bijlagenMap(), id), { force: true }).catch((e) => console.error('[bijlagen] bestand verwijderen mislukt; de nachtrun ruimt het op', e));
}

export async function haalBijlage(id: string): Promise<{ naam: string; type: BijlageType; pad: string }> {
  if (!isUuid(id)) throw new NietGevonden(BIJLAGE_NIET_GEVONDEN);
  const [b] = await db()<{ naam: string; type: BijlageType }[]>`select naam, type from bijlagen where id = ${id}`;
  if (!b) throw new NietGevonden(BIJLAGE_NIET_GEVONDEN);
  return { naam: b.naam, type: b.type, pad: path.join(bijlagenMap(), id) };
}

export async function haalCode(id: string): Promise<Code> {
  if (!isUuid(id)) throw new NietGevonden(BIJLAGE_NIET_GEVONDEN);
  const [b] = await db()<{ codeFormaat: Code['formaat'] | null; codeTekst: string | null }[]>`
    select code_formaat, code_tekst from bijlagen where id = ${id}`;
  if (!b?.codeFormaat || !b.codeTekst) throw new NietGevonden('Geen code bij deze bijlage');
  return { formaat: b.codeFormaat, tekst: b.codeTekst };
}
