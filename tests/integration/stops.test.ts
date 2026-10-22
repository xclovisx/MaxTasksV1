import { beforeEach, describe, expect, it } from 'vitest';
import type { Context } from '../../src/lib/context';
import { db, transactie } from '../../src/lib/db/client';
import { genereerExemplaren, wijzigReeks } from '../../src/lib/diensten/herhalingen';
import { lijstLocaties, maakLocatie } from '../../src/lib/diensten/locaties';
import { haalTaak, maakTaak, taakHistorie, takenOpDatum, verwijderTaak, wijzigTaak, zetStatus } from '../../src/lib/diensten/taken';
import { leegDatabase, maakBeheerderCtx, maakBord, maakMedewerkerCtx } from './helpers';

let beheerder: Context;
let piet: Context;
let bordId: string;

const plek = (naam: string, extra: Record<string, unknown> = {}) =>
  ({ naam, adres: `${naam}straat 1`, lat: 51.5, lng: 4.7, googlePlaceId: null, locatieId: null, bewaar: false, ...extra });
const velden = (titel: string, extra: Record<string, unknown> = {}) =>
  ({ titel, omschrijving: '', datum: '2026-11-02', tijd: null, prioriteit: 'middel' as const, ...extra });

beforeEach(async () => {
  await leegDatabase();
  beheerder = await maakBeheerderCtx();
  piet = await maakMedewerkerCtx('piet', 'Piet');
  bordId = await maakBord();
});

describe('stops bij taken', () => {
  it('maakt een taak met stops, bewaart nieuwe locaties en telt gebruik', async () => {
    const bestaand = (await maakLocatie(piet, plek('Banden-Plus'))).id;
    const { id } = await maakTaak(piet, {
      bordId, herhaling: null,
      ...velden('Ochtendronde', { stops: [plek('Spuiterij', { googlePlaceId: 'g-1', bewaar: true }), plek('Banden-Plus', { locatieId: bestaand })] }),
    });
    const t = await haalTaak(id);
    expect(t.stops.map((s) => s.naam)).toEqual(['Spuiterij', 'Banden-Plus']);
    expect(t.stops[1].locatieId).toBe(bestaand);
    expect(Object.fromEntries((await lijstLocaties()).map((l) => [l.naam, l.gebruikTeller]))).toEqual({ 'Banden-Plus': 1, Spuiterij: 1 });
    expect((await takenOpDatum('2026-11-02'))[0].stops).toHaveLength(2);
  });

  it('weigert meer dan 9 stops', async () => {
    await expect(maakTaak(piet, { bordId, herhaling: null, ...velden('Te veel', { stops: Array(10).fill(plek('X')) }) }))
      .rejects.toThrow('Maximaal 9 locaties');
  });

  it('wijzigen vervangt stops, telt alleen nieuwe locaties en logt historie', async () => {
    const a = (await maakLocatie(piet, plek('A'))).id;
    const b = (await maakLocatie(piet, plek('B'))).id;
    const { id } = await maakTaak(piet, { bordId, herhaling: null, ...velden('T', { stops: [plek('A', { locatieId: a })] }) });
    await wijzigTaak(piet, id, 1, velden('T', { stops: [plek('A', { locatieId: a }), plek('B', { locatieId: b })] }));
    expect((await haalTaak(id)).stops.map((s) => s.naam)).toEqual(['A', 'B']);
    expect(Object.fromEntries((await lijstLocaties()).map((l) => [l.naam, l.gebruikTeller]))).toEqual({ A: 1, B: 1 });
    expect((await taakHistorie(id))[0].wijzigingen).toEqual({ stops: { oud: 'A', nieuw: 'A → B' } });
  });

  it('status wijzigen laat stops staan; verwijderen ruimt ze op', async () => {
    const { id } = await maakTaak(piet, { bordId, herhaling: null, ...velden('T', { stops: [plek('X')] }) });
    await zetStatus(beheerder, id, 1, 'bezig');
    expect((await haalTaak(id)).stops).toHaveLength(1);
    await verwijderTaak(piet, id);
    expect(await db()`select 1 from taak_stops`).toHaveLength(0);
  });
});

describe('stops bij reeksen', () => {
  const VANDAAG = '2026-11-02';

  it('elk exemplaar krijgt de stops, ook later gegenereerde', async () => {
    await maakTaak(piet, {
      bordId, herhaling: { type: 'dagelijks', weekdagen: [], intervalWeken: 1 },
      ...velden('Vegen', { stops: [plek('Werkplaats')] }),
    }, VANDAAG);
    const [{ herhalingId }] = await db()<{ herhalingId: string }[]>`select herhaling_id from taken limit 1`;
    await transactie((tx) => genereerExemplaren(tx, herhalingId, '2026-11-03'));
    const telling = await db()<{ zonder: number }[]>`
      select count(*)::int as zonder from taken t where not exists (select 1 from taak_stops s where s.taak_id = t.id)`;
    expect(telling[0].zonder).toBe(0);
  });

  it('reeks wijzigen past stops toe op nieuwe en bezige exemplaren', async () => {
    const { id } = await maakTaak(piet, {
      bordId, herhaling: { type: 'dagelijks', weekdagen: [], intervalWeken: 1 },
      ...velden('Vegen', { stops: [plek('Oud')] }),
    }, VANDAAG);
    await zetStatus(beheerder, id, 1, 'bezig');
    const [{ herhalingId }] = await db()<{ herhalingId: string }[]>`select herhaling_id from taken where id = ${id}`;
    await wijzigReeks(piet, herhalingId, {
      titel: 'Vegen', omschrijving: '', tijd: null, prioriteit: 'middel',
      herhaling: { type: 'dagelijks', weekdagen: [], intervalWeken: 1 }, stops: [plek('Nieuw')],
    }, VANDAAG);
    const namen = await db()<{ naam: string }[]>`select distinct naam from taak_stops`;
    expect(namen.map((n) => n.naam)).toEqual(['Nieuw']);
    expect((await haalTaak(id)).stops.map((s) => s.naam)).toEqual(['Nieuw']);
  });
});
