import { existsSync } from 'node:fs';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OpslagOntbreekt } from '../../src/lib/fouten';
import { OPSLAG_MARKER } from '../../src/lib/opslag';
import { backupMetMelding, backupNaam, maakBackup, teVerwijderen, type Uitvoerder } from '../../src/worker/taken/backup';

let map: string;

beforeEach(async () => { map = await mkdtemp(path.join(tmpdir(), 'takenbord-backup-')); });
afterEach(async () => { await rm(map, { recursive: true, force: true }); });

/** Nep-pg_dump: schrijft een bestand naar het --file=-argument. */
const nepDump: Uitvoerder = async (_opdracht, args, _env) => {
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
    const aanroepen: [string, string[], Record<string, string>][] = [];
    const r = await maakBackup({
      map, databaseUrl: 'postgres://u:p@db:5432/takenbord', vandaag: '2026-10-24',
      voerUit: async (opdracht, args, env) => { aanroepen.push([opdracht, args, env]); await nepDump(opdracht, args, env); },
    });
    expect(r).toEqual({ bestand: path.join(map, 'takenbord-2026-10-24.dump'), verwijderd: ['takenbord-2026-10-01.dump'] });
    expect(aanroepen[0][0]).toBe('pg_dump');
    expect(aanroepen[0][1]).toContain('--format=custom');
    expect(aanroepen[0][1].some((a) => a.startsWith('--dbname'))).toBe(false);
    expect(aanroepen[0][1].some((a) => a.includes('p@') || a === 'p')).toBe(false);
    expect(aanroepen[0][2]).toEqual({ PGHOST: 'db', PGPORT: '5432', PGUSER: 'u', PGPASSWORD: 'p', PGDATABASE: 'takenbord' });
    expect((await readdir(map)).sort()).toEqual(['takenbord-2026-10-20.dump', 'takenbord-2026-10-24.dump']);
  });

  it('een mislukte dump laat geen half bestand achter en ruimt niets op', async () => {
    await writeFile(path.join(map, 'takenbord-2026-10-01.dump'), 'oud');
    const kapot: Uitvoerder = async (opdracht, args, env) => {
      await nepDump(opdracht, args, env);
      throw new Error('pg_dump stopte met code 1');
    };
    await expect(maakBackup({ map, databaseUrl: 'postgres://u:p@db/x', vandaag: '2026-10-24', voerUit: kapot })).rejects.toThrow('code 1');
    expect(await readdir(map)).toEqual(['takenbord-2026-10-01.dump']);
  });

  it('weigert een ongeldige DATABASE_URL zonder iets uit te voeren', async () => {
    let aangeroepen = false;
    const voerUit: Uitvoerder = async () => { aangeroepen = true; };
    await expect(maakBackup({ map, databaseUrl: 'geen-url', vandaag: '2026-10-24', voerUit })).rejects.toThrow('Ongeldige DATABASE_URL');
    expect(aangeroepen).toBe(false);
  });

  it('ruimt achtergebleven .deel-bestanden van een eerdere run op en laat andere bestanden staan', async () => {
    await writeFile(path.join(map, 'takenbord-2026-10-23.dump.deel'), 'half');
    await writeFile(path.join(map, 'notities.deel'), 'blijft');
    await maakBackup({ map, databaseUrl: 'postgres://u:p@db/takenbord', vandaag: '2026-10-24', voerUit: nepDump });
    expect((await readdir(map)).sort()).toEqual(['notities.deel', 'takenbord-2026-10-24.dump']);
  });
});

describe('back-up op de opslagschijf', () => {
  it('weigert met controle als het controlebestand ontbreekt, en maakt de map niet aan', async () => {
    const sub = path.join(map, 'schijf');
    await expect(maakBackup({ map: sub, databaseUrl: 'postgres://u:p@db/t', vandaag: '2026-10-27', controle: true, voerUit: nepDump }))
      .rejects.toBeInstanceOf(OpslagOntbreekt);
    expect(existsSync(sub)).toBe(false);
  });

  it('werkt met controle als het controlebestand er is', async () => {
    await writeFile(path.join(map, OPSLAG_MARKER), '');
    const r = await maakBackup({ map, databaseUrl: 'postgres://u:p@db/t', vandaag: '2026-10-27', controle: true, voerUit: nepDump });
    expect(r.bestand).toBe(path.join(map, 'takenbord-2026-10-27.dump'));
  });

  it('backupMetMelding meldt een mislukte back-up en niet een gelukte', async () => {
    const meldingen: [string, string][] = [];
    const meld = async (titel: string, tekst: string) => { meldingen.push([titel, tekst]); };
    const basis = { map, databaseUrl: 'postgres://u:p@db/t', vandaag: '2026-10-27', meld };
    expect(await backupMetMelding({ ...basis, controle: false, voerUit: nepDump })).toBe(true);
    expect(meldingen).toEqual([]);
    expect(await backupMetMelding({ ...basis, map: path.join(map, 'weg'), controle: true, voerUit: nepDump })).toBe(false);
    expect(meldingen).toEqual([['Back-up mislukt', 'Back-up van het takenbord mislukt: Opslagschijf niet gevonden, waarschuw de beheerder.']]);
    expect(await backupMetMelding({ ...basis, databaseUrl: undefined, controle: false })).toBe(false);
    expect(meldingen[1][1]).toBe('Back-up van het takenbord mislukt: DATABASE_URL ontbreekt');
  });
});
