import { spawn } from 'node:child_process';
import { mkdir, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { type Datum, plusDagen } from '../../lib/domein/datums';

export const BEWAAR_DAGEN = 14;
const PATROON = /^takenbord-(\d{4}-\d{2}-\d{2})\.dump$/;

export const backupNaam = (d: Datum) => `takenbord-${d}.dump`;

/** Eigen back-ups ouder dan `bewaarDagen` (vandaag telt mee); andere bestanden blijven staan. */
export function teVerwijderen(bestanden: string[], vandaag: Datum, bewaarDagen = BEWAAR_DAGEN): string[] {
  const oudsteDieBlijft = plusDagen(vandaag, -(bewaarDagen - 1));
  return bestanden.filter((b) => {
    const m = PATROON.exec(b);
    return m !== null && m[1] < oudsteDieBlijft;
  });
}

export type Uitvoerder = (opdracht: string, args: string[]) => Promise<void>;

const voerUitMetSpawn: Uitvoerder = (opdracht, args) =>
  new Promise((klaar, faal) => {
    const p = spawn(opdracht, args, { stdio: ['ignore', 'ignore', 'inherit'] });
    p.on('error', faal);
    p.on('exit', (code) => (code === 0 ? klaar() : faal(new Error(`${opdracht} stopte met code ${code}`))));
  });

/** Schrijft eerst naar een .deel-bestand en hernoemt pas als pg_dump slaagt. */
export async function maakBackup(o: {
  map: string;
  databaseUrl: string;
  vandaag: Datum;
  voerUit?: Uitvoerder;
}): Promise<{ bestand: string; verwijderd: string[] }> {
  await mkdir(o.map, { recursive: true });
  const bestand = path.join(o.map, backupNaam(o.vandaag));
  const deel = `${bestand}.deel`;
  try {
    await (o.voerUit ?? voerUitMetSpawn)('pg_dump', ['--format=custom', `--dbname=${o.databaseUrl}`, `--file=${deel}`]);
  } catch (e) {
    await rm(deel, { force: true });
    throw e;
  }
  await rename(deel, bestand);
  const verwijderd = teVerwijderen(await readdir(o.map), o.vandaag);
  await Promise.all(verwijderd.map((b) => rm(path.join(o.map, b))));
  return { bestand, verwijderd };
}
