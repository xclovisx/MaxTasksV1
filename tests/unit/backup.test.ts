import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { backupNaam, maakBackup, teVerwijderen, type Uitvoerder } from '../../src/worker/taken/backup';

let map: string;

beforeEach(async () => { map = await mkdtemp(path.join(tmpdir(), 'takenbord-backup-')); });
afterEach(async () => { await rm(map, { recursive: true, force: true }); });

/** Nep-pg_dump: schrijft een bestand naar het --file=-argument. */
const nepDump: Uitvoerder = async (_opdracht, args) => {
  const doel = args.find((a) => a.startsWith('--file='))!.slice('--file='.length);
  await writeFile(doel, 'dump');
};

describe('back-up', () => {
  it('noemt het bestand naar de datum', () => {
    expect(backupNaam('2026-10-24')).toBe('takenbord-2026-10-24.dump');
  });

  it('verwijdert alleen eigen back-ups ouder dan 14 dagen', () => {
    const bestanden = [
      'takenbord-2026-10-24.dump', 'takenbord-2026-10-11.dump', 'takenbord-2026-10-10.dump', 'takenbord-2026-09-01.dump',
      'notities.txt', 'takenbord-kapot.dump',
    ];
    expect(teVerwijderen(bestanden, '2026-10-24')).toEqual(['takenbord-2026-10-10.dump', 'takenbord-2026-09-01.dump']);
    expect(teVerwijderen(bestanden, '2026-10-24', 1)).toEqual([
      'takenbord-2026-10-11.dump', 'takenbord-2026-10-10.dump', 'takenbord-2026-09-01.dump',
    ]);
  });

  it('maakt een dump met pg_dump en ruimt oude back-ups op', async () => {
    await writeFile(path.join(map, 'takenbord-2026-10-01.dump'), 'oud');
    await writeFile(path.join(map, 'takenbord-2026-10-20.dump'), 'recent');
    const aanroepen: [string, string[]][] = [];
    const r = await maakBackup({
      map, databaseUrl: 'postgres://u:p@db:5432/takenbord', vandaag: '2026-10-24',
      voerUit: async (opdracht, args) => { aanroepen.push([opdracht, args]); await nepDump(opdracht, args); },
    });
    expect(r).toEqual({ bestand: path.join(map, 'takenbord-2026-10-24.dump'), verwijderd: ['takenbord-2026-10-01.dump'] });
    expect(aanroepen[0][0]).toBe('pg_dump');
    expect(aanroepen[0][1]).toContain('--format=custom');
    expect(aanroepen[0][1]).toContain('--dbname=postgres://u:p@db:5432/takenbord');
    expect((await readdir(map)).sort()).toEqual(['takenbord-2026-10-20.dump', 'takenbord-2026-10-24.dump']);
  });

  it('een mislukte dump laat geen half bestand achter en ruimt niets op', async () => {
    await writeFile(path.join(map, 'takenbord-2026-10-01.dump'), 'oud');
    const kapot: Uitvoerder = async (opdracht, args) => {
      await nepDump(opdracht, args);
      throw new Error('pg_dump stopte met code 1');
    };
    await expect(maakBackup({ map, databaseUrl: 'postgres://x', vandaag: '2026-10-24', voerUit: kapot })).rejects.toThrow('code 1');
    expect(await readdir(map)).toEqual(['takenbord-2026-10-01.dump']);
  });
});
