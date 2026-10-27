import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Context } from '../../src/lib/context';
import { db } from '../../src/lib/db/client';
import { voegBijlageToe } from '../../src/lib/diensten/bijlagen';
import { maakTaak, verwijderTaak } from '../../src/lib/diensten/taken';
import { ruimBijlagenOp } from '../../src/worker/taken/bijlagen';
import { leegDatabase, maakBord, maakMedewerkerCtx } from './helpers';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
const UUR = 60 * 60 * 1000;
const DAG = 24 * UUR;

let map: string;
let piet: Context;
let bordId: string;

async function taakMetBijlage(titel: string): Promise<{ taakId: string; bijlageId: string }> {
  const { id } = await maakTaak(piet, { bordId, herhaling: null, titel, omschrijving: '', datum: '2026-10-27', tijd: null, prioriteit: 'middel' });
  const b = await voegBijlageToe(piet, id, { naam: `${titel}.png`, inhoud: PNG });
  return { taakId: id, bijlageId: b.id };
}
const zetKlaar = (taakId: string, geleden: number) =>
  db()`update taken set status = 'klaar', klaar_op = ${new Date(Date.now() - geleden)} where id = ${taakId}`;
const aantalRijen = async () => (await db()<{ n: number }[]>`select count(*)::int as n from bijlagen`)[0].n;

beforeEach(async () => {
  await leegDatabase();
  map = await mkdtemp(path.join(tmpdir(), 'takenbord-opruimen-'));
  process.env.BIJLAGEN_MAP = map;
  piet = await maakMedewerkerCtx('piet');
  bordId = await maakBord();
});

afterEach(async () => {
  delete process.env.BIJLAGEN_MAP;
  await rm(map, { recursive: true, force: true });
});

describe('bijlagen opruimen', () => {
  it('haalt bijlagen weg van taken die langer dan 30 dagen klaar zijn', async () => {
    const oud = await taakMetBijlage('oud');
    const recent = await taakMetBijlage('recent');
    const open = await taakMetBijlage('open');
    await zetKlaar(oud.taakId, 31 * DAG);
    await zetKlaar(recent.taakId, 10 * DAG);

    const r = await ruimBijlagenOp({ map, nu: new Date(Date.now() + 2 * UUR) });
    expect(r.oud).toBe(1);
    expect(await aantalRijen()).toBe(2);
    expect((await readdir(map)).sort()).toEqual([recent.bijlageId, open.bijlageId].sort());
  });

  it('ruimt losse bestanden op, maar alleen als ze ouder zijn dan een uur', async () => {
    const t = await taakMetBijlage('weg');
    await verwijderTaak(piet, t.taakId);
    const vers = randomUUID();
    await writeFile(path.join(map, `${vers}.deel`), 'x');
    await writeFile(path.join(map, 'notities.txt'), 'blijft');

    expect((await ruimBijlagenOp({ map })).los).toBe(0);
    const r = await ruimBijlagenOp({ map, nu: new Date(Date.now() + 2 * UUR) });
    expect(r.los).toBe(2);
    expect(await readdir(map)).toEqual(['notities.txt']);
  });

  it('laat bestanden staan als de opslagschijf ontbreekt (controle aan, geen controlebestand)', async () => {
    const t = await taakMetBijlage('x');
    await verwijderTaak(piet, t.taakId);
    const r = await ruimBijlagenOp({ map, nu: new Date(Date.now() + 2 * UUR), controle: true });
    expect(r.los).toBe(0);
    expect(await readdir(map)).toEqual([t.bijlageId]);
  });
});
