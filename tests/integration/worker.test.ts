import { beforeEach, describe, expect, it } from 'vitest';
import type { Context } from '../../src/lib/context';
import { db } from '../../src/lib/db/client';
import { maakTaak, zetStatus } from '../../src/lib/diensten/taken';
import { doorschuiven } from '../../src/worker/taken/doorschuiven';
import { genereerAlleHerhalingen } from '../../src/worker/taken/herhalingen';
import { leegDatabase, maakBeheerderCtx, maakBord, maakMedewerkerCtx, zetWerkdagen } from './helpers';

let beheerder: Context;
let piet: Context;
let bordId: string;

beforeEach(async () => {
  await leegDatabase();
  beheerder = await maakBeheerderCtx();
  bordId = await maakBord('Takenbord');
  piet = await maakMedewerkerCtx('piet');
});

const taak = (titel: string, datum: string) =>
  maakTaak(piet, { bordId, titel, omschrijving: '', datum, tijd: null, prioriteit: 'middel', herhaling: null });

const staat = async (id: string) =>
  (await db()<{ datum: string; uitgesteldVan: string | null; gemist: boolean }[]>`select datum, uitgesteld_van, gemist from taken where id = ${id}`)[0];

describe('doorschuiven', () => {
  it('verplaatst open en bezige taken, niet klare; onthoudt de eerste oude datum', async () => {
    const a = await taak('A', '2026-11-02');
    const b = await taak('B', '2026-11-02');
    const c = await taak('C', '2026-11-03');
    await zetStatus(beheerder, b.id, 1, 'klaar');
    await zetStatus(beheerder, c.id, 1, 'bezig');

    expect(await doorschuiven(db(), '2026-11-04')).toEqual({ verplaatst: 2, gemist: 0 });
    expect(await staat(a.id)).toEqual({ datum: '2026-11-04', uitgesteldVan: '2026-11-02', gemist: false });
    expect((await staat(b.id)).datum).toBe('2026-11-02');
    expect(await staat(c.id)).toMatchObject({ datum: '2026-11-04', uitgesteldVan: '2026-11-03' });

    expect(await doorschuiven(db(), '2026-11-04')).toEqual({ verplaatst: 0, gemist: 0 });
    await doorschuiven(db(), '2026-11-05');
    expect(await staat(a.id)).toMatchObject({ datum: '2026-11-05', uitgesteldVan: '2026-11-02' });
  });

  it('schuift in het weekend door naar de eerste werkdag van de garage', async () => {
    const a = await taak('A', '2026-11-06');
    await doorschuiven(db(), '2026-11-07');
    expect((await staat(a.id)).datum).toBe('2026-11-09');

    const z = await taak('Z', '2026-11-06');
    await zetWerkdagen([1, 2, 3, 4, 5, 6]);
    await doorschuiven(db(), '2026-11-07');
    expect((await staat(z.id)).datum).toBe('2026-11-07');
  });

  it('markeert achterstallige reeks-exemplaren als gemist als de reeks vandaag al een exemplaar heeft', async () => {
    await maakTaak(piet, {
      bordId, titel: 'Vegen', omschrijving: '', datum: '2026-11-02', tijd: null, prioriteit: 'laag',
      herhaling: { type: 'dagelijks', weekdagen: [], intervalWeken: 1 },
    }, '2026-11-02');
    expect(await doorschuiven(db(), '2026-11-04')).toEqual({ verplaatst: 0, gemist: 2 });
    const rijen = await db()<{ datum: string; gemist: boolean }[]>`select datum, gemist from taken where datum < '2026-11-05' order by datum`;
    expect(rijen).toEqual([
      { datum: '2026-11-02', gemist: true },
      { datum: '2026-11-03', gemist: true },
      { datum: '2026-11-04', gemist: false },
    ]);
  });
});

describe('genereerAlleHerhalingen', () => {
  it('vult alle actieve reeksen aan', async () => {
    await maakTaak(piet, {
      bordId, titel: 'Vegen', omschrijving: '', datum: '2026-11-02', tijd: null, prioriteit: 'laag',
      herhaling: { type: 'dagelijks', weekdagen: [], intervalWeken: 1 },
    }, '2026-11-02');
    expect(await genereerAlleHerhalingen(db(), '2026-11-03')).toBe(1);
    await db()`update herhalingen set actief = false`;
    expect(await genereerAlleHerhalingen(db(), '2026-11-10')).toBe(0);
  });
});
