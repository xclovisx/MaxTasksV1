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

describe('locaties-schema', () => {
  it('taken_weergave levert stops op volgorde en een lege lijst zonder stops', async () => {
    await leegDatabase();
    const [b] = await db()<{ id: string }[]>`insert into borden (naam) values ('B') returning id`;
    const [t] = await db()<{ id: string }[]>`insert into taken (bord_id, titel, datum, prioriteit, oorspronkelijke_datum)
      values (${b.id}, 'Met stops', '2026-10-22', 'laag', '2026-10-22') returning id`;
    await db()`insert into taken (bord_id, titel, datum, prioriteit, oorspronkelijke_datum) values (${b.id}, 'Zonder', '2026-10-22', 'laag', '2026-10-22')`;
    await db()`insert into taak_stops (taak_id, volgorde, naam, adres, lat, lng) values
      (${t.id}, 2, 'Tweede', 'Adres 2', 52.0, 5.0), (${t.id}, 1, 'Eerste', 'Adres 1', 51.5, 4.5)`;
    const rijen = await db()<{ titel: string; stops: { naam: string; lat: number; locatieId: string | null }[] }[]>`
      select titel, stops from taken_weergave order by titel`;
    expect(rijen[0].stops.map((s) => s.naam)).toEqual(['Eerste', 'Tweede']);
    expect(rijen[0].stops[0]).toMatchObject({ lat: 51.5, locatieId: null });
    expect(rijen[1].stops).toEqual([]);
  });

  it('bewaakt volgorde 1–9 en unieke google_place_id', async () => {
    await leegDatabase();
    const [b] = await db()<{ id: string }[]>`insert into borden (naam) values ('B') returning id`;
    const [t] = await db()<{ id: string }[]>`insert into taken (bord_id, titel, datum, prioriteit, oorspronkelijke_datum)
      values (${b.id}, 'T', '2026-10-22', 'laag', '2026-10-22') returning id`;
    await expect(db()`insert into taak_stops (taak_id, volgorde, naam, adres, lat, lng) values (${t.id}, 10, 'X', 'Y', 1, 1)`)
      .rejects.toThrow(/taak_stops_volgorde_check/);
    await db()`insert into locaties (naam, adres, lat, lng, google_place_id) values ('A', 'a', 1, 1, 'plaats-1')`;
    await expect(db()`insert into locaties (naam, adres, lat, lng, google_place_id) values ('B', 'b', 2, 2, 'plaats-1')`)
      .rejects.toThrow(/locaties_google_place_id_key/);
  });
});
