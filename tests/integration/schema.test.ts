import { beforeEach, describe, expect, it } from 'vitest';
import { db, maakSql } from '../../src/lib/db/client';
import { migreer } from '../../src/lib/db/migreer';
import { leegDatabase } from './helpers';

async function maakBordMetTaak() {
  const [g] = await db()<{ id: string }[]>`insert into gebruikers (naam, gebruikersnaam, rol) values ('Jan', 'jan', 'medewerker') returning id`;
  const [bord] = await db()<{ id: string }[]>`insert into borden (naam) values ('Werkplaats') returning id`;
  const [taak] = await db()<{ id: string }[]>`insert into taken (bord_id, titel, datum, prioriteit, oorspronkelijke_datum, aangemaakt_door)
    values (${bord.id}, 'Olie verversen', '2026-10-22', 'middel', '2026-10-22', ${g.id}) returning id`;
  return { gebruikerId: g.id, bordId: bord.id, taakId: taak.id };
}

describe('schema', () => {
  beforeEach(leegDatabase);

  it('migreer geeft bij een tweede run niets terug', async () => {
    const sql = maakSql(process.env.DATABASE_URL!, { max: 1 });
    try {
      expect(await migreer(sql)).toEqual([]);
    } finally {
      await sql.end();
    }
  });

  it('instellingen heeft precies één rij met standaardwaarden en weigert een tweede', async () => {
    const rijen = await db()<{ naam: string; werkdagen: number[] }[]>`select naam, werkdagen from instellingen`;
    expect(rijen).toHaveLength(1);
    expect(rijen[0].naam).toBe('Garage');
    expect(rijen[0].werkdagen).toEqual([1, 2, 3, 4, 5]);
    await expect(db()`insert into instellingen default values`).rejects.toThrow();
    await expect(db()`insert into instellingen (id) values (false)`).rejects.toThrow();
  });

  it('geeft een date-kolom terug als string', async () => {
    await maakBordMetTaak();
    const [t] = await db()<{ datum: string }[]>`select datum from taken`;
    expect(t.datum).toBe('2026-10-22');
  });

  it('taken_weergave levert aangemaakt_door_naam en bord_naam', async () => {
    await maakBordMetTaak();
    const [t] = await db()<{ aangemaaktDoorNaam: string; bordNaam: string }[]>`select aangemaakt_door_naam, bord_naam from taken_weergave`;
    expect(t.aangemaaktDoorNaam).toBe('Jan');
    expect(t.bordNaam).toBe('Werkplaats');
  });

  it('de unieke index weigert twee taken met dezelfde (herhaling_id, oorspronkelijke_datum)', async () => {
    const { bordId } = await maakBordMetTaak();
    const [h] = await db()<{ id: string }[]>`insert into herhalingen (bord_id, titel, prioriteit, type, startdatum)
      values (${bordId}, 'Dagelijks', 'laag', 'dagelijks', '2026-10-22') returning id`;
    const voegToe = () => db()`insert into taken (bord_id, titel, datum, prioriteit, oorspronkelijke_datum, herhaling_id)
      values (${bordId}, 'Herhaald', '2026-10-22', 'laag', '2026-10-22', ${h.id})`;
    await voegToe();
    await expect(voegToe()).rejects.toThrow(/taken_herhaling_datum/);
  });
});
