import { spawn } from 'node:child_process';
import { readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { type Datum, plusDagen } from '../../lib/domein/datums';
import { vereisOpslag } from '../../lib/opslag';

export const BEWAAR_DAGEN = 14;
const PATROON = /^takenbord-(\d{4}-\d{2}-\d{2})\.dump$/;
const DEEL_PATROON = /^takenbord-\d{4}-\d{2}-\d{2}\.dump\.deel$/;

export const backupNaam = (d: Datum) => `takenbord-${d}.dump`;

/** Eigen back-ups ouder dan `bewaarDagen` (vandaag telt mee); andere bestanden blijven staan. */
export function teVerwijderen(bestanden: string[], vandaag: Datum, bewaarDagen = BEWAAR_DAGEN): string[] {
  const oudsteDieBlijft = plusDagen(vandaag, -(bewaarDagen - 1));
  return bestanden.filter((b) => {
    const m = PATROON.exec(b);
    return m !== null && m[1] < oudsteDieBlijft;
  });
}

export type Uitvoerder = (opdracht: string, args: string[], env: Record<string, string>) => Promise<void>;

const voerUitMetSpawn: Uitvoerder = (opdracht, args, env) =>
  new Promise((klaar, faal) => {
    const p = spawn(opdracht, args, { stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, ...env } });
    // Nooit de ruwe fout doorgeven: die bevat de argumenten/omgeving van het proces.
    p.on('error', (err: NodeJS.ErrnoException) => faal(new Error(`${opdracht} starten mislukt (${err.code ?? 'onbekend'})`)));
    p.on('exit', (code, signal) =>
      code === 0 ? klaar() : faal(new Error(`${opdracht} stopte met ${signal ? `signaal ${signal}` : `code ${code}`}`)));
  });

/** Zet de database-URL om in libpq-omgevingsvariabelen, zodat het wachtwoord niet in de argumenten staat. */
function pgOmgeving(databaseUrl: string): Record<string, string> {
  let u: URL;
  try {
    u = new URL(databaseUrl);
  } catch {
    throw new Error('Ongeldige DATABASE_URL');
  }
  return {
    PGHOST: u.hostname,
    PGPORT: u.port || '5432',
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: decodeURIComponent(u.pathname.replace(/^\//, '')),
  };
}

/** Schrijft eerst naar een .deel-bestand en hernoemt pas als pg_dump slaagt. */
export async function maakBackup(o: {
  map: string;
  databaseUrl: string;
  vandaag: Datum;
  controle?: boolean;
  voerUit?: Uitvoerder;
}): Promise<{ bestand: string; verwijderd: string[] }> {
  const env = pgOmgeving(o.databaseUrl);
  await vereisOpslag(o.map, o.controle ?? false);
  // Restanten van een eerder afgebroken run.
  for (const b of await readdir(o.map)) {
    if (DEEL_PATROON.test(b)) await rm(path.join(o.map, b), { force: true });
  }
  const bestand = path.join(o.map, backupNaam(o.vandaag));
  const deel = `${bestand}.deel`;
  try {
    await (o.voerUit ?? voerUitMetSpawn)('pg_dump', ['--format=custom', `--file=${deel}`], env);
  } catch (e) {
    await rm(deel, { force: true });
    throw e;
  }
  await rename(deel, bestand);
  const verwijderd = teVerwijderen(await readdir(o.map), o.vandaag);
  await Promise.all(verwijderd.map((b) => rm(path.join(o.map, b))));
  return { bestand, verwijderd };
}

/** Maakt de back-up en meldt een storing aan de beheerder; gooit nooit. */
export async function backupMetMelding(o: {
  map: string;
  databaseUrl: string | undefined;
  vandaag: Datum;
  controle: boolean;
  voerUit?: Uitvoerder;
  meld: (titel: string, tekst: string) => Promise<void>;
}): Promise<boolean> {
  try {
    if (!o.databaseUrl) throw new Error('DATABASE_URL ontbreekt');
    const r = await maakBackup({ map: o.map, databaseUrl: o.databaseUrl, vandaag: o.vandaag, controle: o.controle, voerUit: o.voerUit });
    console.log(`[worker] back-up gemaakt: ${r.bestand}${r.verwijderd.length ? `, ${r.verwijderd.length} oude verwijderd` : ''}`);
    return true;
  } catch (e) {
    const reden = e instanceof Error ? e.message : String(e);
    console.error('[worker] back-up mislukt', e);
    await o.meld('Back-up mislukt', `Back-up van het takenbord mislukt: ${reden}`);
    return false;
  }
}
