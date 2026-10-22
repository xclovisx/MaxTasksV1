import { beforeEach, describe, expect, it } from 'vitest';
import type { Context } from '../../src/lib/context';
import { db, transactie } from '../../src/lib/db/client';
import { haalInstellingen, wijzigInstellingen } from '../../src/lib/diensten/instellingen';
import {
  hernoemLocatie, lijstLocaties, maakLocatie, vaakGebruikteLocaties, verwijderLocatie,
} from '../../src/lib/diensten/locaties';
import { bewaarNieuweLocaties, haalStops, schrijfStops, stopsTekst, telGebruik } from '../../src/lib/diensten/stops';
import { NietGevonden } from '../../src/lib/fouten';
import { leegDatabase, maakBeheerderCtx, maakBord, maakMedewerkerCtx } from './helpers';

let beheerder: Context;
let piet: Context;

const plek = (naam: string, extra: Record<string, unknown> = {}) =>
  ({ naam, adres: `${naam}straat 1`, lat: 51.5, lng: 4.7, googlePlaceId: null, ...extra });

beforeEach(async () => {
  await leegDatabase();
  beheerder = await maakBeheerderCtx();
  piet = await maakMedewerkerCtx('piet');
});

describe('opgeslagen locaties', () => {
  it('maakt, sorteert, hernoemt en verwijdert locaties (ook als medewerker)', async () => {
    const { id: b } = await maakLocatie(piet, plek('banden-Plus'));
    await maakLocatie(piet, plek('Apotheek'));
    expect((await lijstLocaties()).map((l) => l.naam)).toEqual(['Apotheek', 'banden-Plus']);
    await hernoemLocatie(piet, b, 'Banden-Plus Breda');
    expect((await lijstLocaties()).find((l) => l.id === b)?.naam).toBe('Banden-Plus Breda');
    await verwijderLocatie(piet, b);
    expect((await lijstLocaties()).map((l) => l.naam)).toEqual(['Apotheek']);
    await expect(verwijderLocatie(piet, b)).rejects.toBeInstanceOf(NietGevonden);
    await expect(hernoemLocatie(piet, 'onzin', 'X')).rejects.toBeInstanceOf(NietGevonden);
  });

  it('dezelfde Google-plaats wordt niet dubbel opgeslagen', async () => {
    const a = await maakLocatie(piet, plek('Origineel', { googlePlaceId: 'g-1' }));
    const b = await maakLocatie(beheerder, plek('Andere naam', { googlePlaceId: 'g-1' }));
    expect(b.id).toBe(a.id);
    expect((await lijstLocaties()).map((l) => l.naam)).toEqual(['Origineel']);
  });

  it('vaak gebruikt: alleen gebruikte, hoogste teller eerst, maximaal 5', async () => {
    const ids: string[] = [];
    for (const n of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) ids.push((await maakLocatie(piet, plek(n))).id);
    await db()`update locaties set gebruik_teller = 1`;
    await db()`update locaties set gebruik_teller = 5 where id = ${ids[6]}`;
    await db()`update locaties set gebruik_teller = 0 where id = ${ids[0]}`;
    expect((await vaakGebruikteLocaties()).map((l) => l.naam)).toEqual(['G', 'B', 'C', 'D', 'E']);
  });
});

describe('stops-hulpfuncties', () => {
  it('bewaart nieuwe locaties, hergebruikt bestaande en schrijft stops op volgorde', async () => {
    const bestaand = (await maakLocatie(piet, plek('Bestaand'))).id;
    const bordId = await maakBord();
    const [t] = await db()<{ id: string }[]>`insert into taken (bord_id, titel, datum, prioriteit, oorspronkelijke_datum)
      values (${bordId}, 'T', '2026-10-22', 'laag', '2026-10-22') returning id`;
    const stops = await transactie(async (tx) => {
      const s = await bewaarNieuweLocaties(tx, [
        { ...plek('Nieuw', { googlePlaceId: 'g-9' }), locatieId: null, bewaar: true },
        { ...plek('Bestaand'), locatieId: bestaand, bewaar: false },
        { ...plek('Eenmalig'), locatieId: null, bewaar: false },
      ]);
      await schrijfStops(tx, t.id, s);
      await telGebruik(tx, [...s.map((x) => x.locatieId), bestaand]);
      return haalStops(tx, t.id);
    });
    expect(stops.map((s) => s.naam)).toEqual(['Nieuw', 'Bestaand', 'Eenmalig']);
    expect(stops[0].locatieId).not.toBeNull();
    expect(stops[1].locatieId).toBe(bestaand);
    expect(stops[2].locatieId).toBeNull();
    const tellers = Object.fromEntries((await lijstLocaties()).map((l) => [l.naam, l.gebruikTeller]));
    expect(tellers).toEqual({ Bestaand: 1, Nieuw: 1 });
    expect(stopsTekst(stops)).toBe('Nieuw → Bestaand → Eenmalig');
  });
});

describe('garage-coördinaten', () => {
  it('slaat het garage-adres met coördinaten op en wist ze samen', async () => {
    await wijzigInstellingen(beheerder, { naam: 'G', garageAdres: 'Dorpsstraat 1, Breda', garageLat: 51.58, garageLng: 4.77, werkdagen: [1, 2, 3, 4, 5] });
    expect(await haalInstellingen()).toMatchObject({ garageAdres: 'Dorpsstraat 1, Breda', garageLat: 51.58, garageLng: 4.77 });
    await wijzigInstellingen(beheerder, { naam: 'G', garageAdres: '', garageLat: 51.58, garageLng: 4.77, werkdagen: [1] });
    expect(await haalInstellingen()).toMatchObject({ garageAdres: null, garageLat: null, garageLng: null });
  });
});
