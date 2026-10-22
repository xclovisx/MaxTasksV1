import { db, type Db } from '../../lib/db/client';
import { meldWijziging } from '../../lib/db/gebeurtenissen';
import { type Datum, eersteWerkdagVanaf, vandaagInAmsterdam } from '../../lib/domein/datums';
import { type OpenTaak, planDoorschuiven, reeksSleutel } from '../../lib/domein/doorschuiven';

export async function doorschuiven(sql: Db = db(), vandaag: Datum = vandaagInAmsterdam()): Promise<{ verplaatst: number; gemist: number }> {
  return (await sql.begin(async (tx) => {
    const [instellingen] = await tx<{ werkdagen: number[] }[]>`select werkdagen from instellingen`;
    const werkdagen = instellingen.werkdagen;
    const open = await tx<(OpenTaak & { bordId: string })[]>`
      select id, datum, herhaling_id, bord_id from taken
      where status in ('open', 'bezig') and not gemist and datum < ${vandaag}
      for update`;
    if (open.length === 0) return { verplaatst: 0, gemist: 0 };
    const doel = eersteWerkdagVanaf(vandaag, werkdagen);
    const bezet = await tx<{ herhalingId: string; datum: Datum }[]>`
      select herhaling_id, datum from taken
      where datum = ${doel} and herhaling_id is not null`;
    const plan = planDoorschuiven(open, vandaag, werkdagen, new Set(bezet.map((r) => reeksSleutel(r.herhalingId, r.datum))));
    for (const v of plan.verplaatsen) {
      await tx`update taken set datum = ${v.naar}, uitgesteld_van = coalesce(uitgesteld_van, datum), versie = versie + 1,
        gewijzigd_door = null, gewijzigd_op = now() where id = ${v.id}`;
    }
    if (plan.gemist.length > 0) {
      await tx`update taken set gemist = true, versie = versie + 1, gewijzigd_door = null, gewijzigd_op = now() where id in ${tx(plan.gemist)}`;
    }
    for (const bordId of new Set(open.map((t) => t.bordId))) await meldWijziging(tx, bordId);
    return { verplaatst: plan.verplaatsen.length, gemist: plan.gemist.length };
  })) as { verplaatst: number; gemist: number };
}
