import { readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { db, transactie } from '../../lib/db/client';
import { meldWijziging } from '../../lib/db/gebeurtenissen';
import { BEWAAR_DAGEN_NA_KLAAR } from '../../lib/domein/bijlagen';
import { opslagAanwezig } from '../../lib/opslag';

const BIJLAGE_BESTAND = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\.deel)?$/;
/** Jonger dan dit kan een upload zijn die nog bezig is. */
const LOS_NA_MS = 60 * 60 * 1000;

/**
 * Verwijdert bijlagen van taken die langer dan 30 dagen klaar zijn, en daarna bestanden zonder rij
 * (van verwijderde taken of afgebroken uploads). Andere bestanden in de map blijven staan.
 */
export async function ruimBijlagenOp(o: { map: string; nu?: Date; controle?: boolean }): Promise<{ oud: number; los: number }> {
  const nu = o.nu ?? new Date();
  const grens = new Date(nu.getTime() - BEWAAR_DAGEN_NA_KLAAR * 24 * 60 * 60 * 1000);
  const oud = await transactie(async (tx) => {
    const rijen = await tx<{ id: string; bordId: string }[]>`
      delete from bijlagen b using taken t
      where t.id = b.taak_id and t.status = 'klaar' and t.klaar_op < ${grens}
      returning b.id, t.bord_id`;
    for (const bordId of new Set(rijen.map((r) => r.bordId))) await meldWijziging(tx, bordId);
    return rijen.length;
  });

  if (!(await opslagAanwezig(o.map, o.controle))) return { oud, los: 0 };
  let namen: string[];
  try {
    namen = await readdir(o.map);
  } catch {
    return { oud, los: 0 };
  }
  const kandidaten = namen.flatMap((naam) => {
    const m = BIJLAGE_BESTAND.exec(naam);
    return m ? [{ naam, id: m[1], deel: Boolean(m[2]) }] : [];
  });
  const ids = [...new Set(kandidaten.map((k) => k.id))];
  const bekend = new Set(
    ids.length ? (await db()<{ id: string }[]>`select id from bijlagen where id in ${db()(ids)}`).map((r) => r.id) : [],
  );
  let los = 0;
  for (const k of kandidaten) {
    if (bekend.has(k.id) && !k.deel) continue;
    const pad = path.join(o.map, k.naam);
    const s = await stat(pad).catch(() => null);
    if (!s || nu.getTime() - s.mtimeMs < LOS_NA_MS) continue;
    await rm(pad, { force: true });
    los++;
  }
  return { oud, los };
}
