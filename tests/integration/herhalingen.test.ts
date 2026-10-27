import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Context } from '../../src/lib/context';
import { db, transactie } from '../../src/lib/db/client';
import { voegBijlageToe } from '../../src/lib/diensten/bijlagen';
import { genereerExemplaren, stopReeks, wijzigReeks } from '../../src/lib/diensten/herhalingen';
import { maakTaak, verwijderTaak, wijzigTaak, zetStatus } from '../../src/lib/diensten/taken';
import { NietGevonden } from '../../src/lib/fouten';
import { leegDatabase, maakBeheerderCtx, maakBord, maakMedewerkerCtx } from './helpers';

const VANDAAG = '2026-11-02'; // maandag

let beheerder: Context;
let piet: Context;
let bordId: string;

beforeEach(async () => {
  await leegDatabase();
  beheerder = await maakBeheerderCtx();
  bordId = await maakBord('Takenbord');
  piet = await maakMedewerkerCtx('piet', 'Piet');
});

const maakDagelijks = () => maakTaak(piet, {
  bordId, titel: 'Werkplaats vegen', omschrijving: '', datum: VANDAAG, tijd: '17:00', prioriteit: 'laag',
  herhaling: { type: 'dagelijks', weekdagen: [], intervalWeken: 1 },
}, VANDAAG);

async function reeks() {
  return db()<{ id: string; datum: string; titel: string; status: string; herhalingId: string }[]>`
    select id, datum, titel, status, herhaling_id from taken order by datum`;
}

const genereer = (herhalingId: string, vandaag: string) => transactie((tx) => genereerExemplaren(tx, herhalingId, vandaag));

describe('herhalende reeksen', () => {
  it('maakt 14 dagen vooruit taken op werkdagen en geeft de eerste terug', async () => {
    const { id } = await maakDagelijks();
    const taken = await reeks();
    expect(taken.map((t) => t.datum)).toEqual([
      '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06',
      '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13',
    ]);
    expect(taken[0].id).toBe(id);
  });

  it('genereert idempotent en schuift de horizon op', async () => {
    await maakDagelijks();
    const h = (await reeks())[0].herhalingId;
    expect(await genereer(h, VANDAAG)).toBe(0);
    expect(await genereer(h, '2026-11-03')).toBe(1);
    expect((await reeks()).at(-1)?.datum).toBe('2026-11-16');
  });

  it('maakt een los verwijderd exemplaar niet opnieuw aan', async () => {
    await maakDagelijks();
    const taken = await reeks();
    await verwijderTaak(piet, taken[2].id); // 2026-11-04
    await genereer(taken[0].herhalingId, '2026-11-03');
    expect((await reeks()).map((t) => t.datum)).not.toContain('2026-11-04');
  });

  it('reeks wijzigen: los gewijzigde exemplaren blijven, de rest volgt het nieuwe schema', async () => {
    await maakDagelijks();
    const taken = await reeks();
    await wijzigTaak(piet, taken[1].id, 1, { titel: 'Los', omschrijving: '', datum: '2026-11-03', tijd: '17:00', prioriteit: 'laag' });
    await wijzigReeks(piet, taken[0].herhalingId, {
      titel: 'Nieuw', omschrijving: '', tijd: '16:00', prioriteit: 'middel',
      herhaling: { type: 'weekdagen', weekdagen: [1, 4], intervalWeken: 1 },
    }, VANDAAG);
    expect((await reeks()).map((t) => [t.datum, t.titel])).toEqual([
      ['2026-11-02', 'Nieuw'], ['2026-11-03', 'Los'], ['2026-11-05', 'Nieuw'], ['2026-11-09', 'Nieuw'], ['2026-11-12', 'Nieuw'],
    ]);
  });

  it('reeks wijzigen: een exemplaar dat bezig is blijft bestaan en krijgt de nieuwe titel', async () => {
    await maakDagelijks();
    const taken = await reeks();
    await zetStatus(beheerder, taken[2].id, 1, 'bezig');
    await wijzigReeks(piet, taken[0].herhalingId, {
      titel: 'Nieuw', omschrijving: '', tijd: '17:00', prioriteit: 'laag',
      herhaling: { type: 'dagelijks', weekdagen: [], intervalWeken: 1 },
    }, VANDAAG);
    const bezig = (await reeks()).find((t) => t.id === taken[2].id);
    expect(bezig).toMatchObject({ titel: 'Nieuw', status: 'bezig' });
  });

  it('reeks stoppen verwijdert toekomstige open exemplaren en genereert niets meer', async () => {
    await maakDagelijks();
    const h = (await reeks())[0].herhalingId;
    await stopReeks(piet, h, '2026-11-04');
    expect((await reeks()).map((t) => t.datum)).toEqual(['2026-11-02', '2026-11-03']);
    expect(await genereer(h, '2026-11-05')).toBe(0);
  });

  it('onbekende reeks geeft NietGevonden', async () => {
    const onbekend = crypto.randomUUID();
    const invoer = { titel: 'X', omschrijving: '', tijd: null, prioriteit: 'laag' as const, herhaling: { type: 'dagelijks' as const, weekdagen: [], intervalWeken: 1 } };
    await expect(wijzigReeks(piet, onbekend, invoer, VANDAAG)).rejects.toBeInstanceOf(NietGevonden);
    await expect(stopReeks(piet, onbekend, VANDAAG)).rejects.toBeInstanceOf(NietGevonden);
  });

  describe('met een bijlage', () => {
    let map: string;
    const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
    const aantalBijlagen = async () => (await db()<{ n: number }[]>`select count(*)::int as n from bijlagen`)[0].n;

    beforeEach(async () => {
      map = await mkdtemp(path.join(tmpdir(), 'takenbord-reeks-'));
      process.env.BIJLAGEN_MAP = map;
      delete process.env.OPSLAG_CONTROLE;
    });
    afterEach(async () => {
      delete process.env.BIJLAGEN_MAP;
      await rm(map, { recursive: true, force: true });
    });

    const nieuweRegel = { titel: 'Nieuw', omschrijving: '', tijd: '16:00', prioriteit: 'middel' as const, herhaling: { type: 'dagelijks' as const, weekdagen: [], intervalWeken: 1 } };

    it('reeks wijzigen: een exemplaar met een bijlage blijft bestaan, bijlage incluis', async () => {
      await maakDagelijks();
      const taken = await reeks();
      await voegBijlageToe(piet, taken[3].id, { naam: 'qr.png', inhoud: PNG });
      await wijzigReeks(piet, taken[0].herhalingId, nieuweRegel, VANDAAG);
      expect((await reeks()).find((t) => t.id === taken[3].id)).toMatchObject({ titel: 'Werkplaats vegen' });
      expect(await aantalBijlagen()).toBe(1);
    });

    it('reeks stoppen: een exemplaar met een bijlage blijft bestaan, bijlage incluis', async () => {
      await maakDagelijks();
      const taken = await reeks();
      await voegBijlageToe(piet, taken[3].id, { naam: 'qr.png', inhoud: PNG });
      await stopReeks(piet, taken[0].herhalingId, VANDAAG);
      expect((await reeks()).map((t) => t.id)).toContain(taken[3].id);
      expect(await aantalBijlagen()).toBe(1);
    });
  });
});
