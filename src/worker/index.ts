import cron from 'node-cron';
import { db } from '../lib/db/client';
import { vandaagInAmsterdam } from '../lib/domein/datums';
import { meldStoring } from '../lib/diensten/meldingen';
import { opslagControleAan } from '../lib/opslag';
import { backupMetMelding } from './taken/backup';
import { ruimBijlagenOp } from './taken/bijlagen';
import { doorschuiven } from './taken/doorschuiven';
import { genereerAlleHerhalingen } from './taken/herhalingen';

async function nachtrun(): Promise<void> {
  const vandaag = vandaagInAmsterdam();
  let nieuw = 0;
  let verplaatst = 0;
  let gemist = 0;
  try {
    nieuw = await genereerAlleHerhalingen(undefined, vandaag);
  } catch (e) {
    console.error('[worker] herhalingen genereren mislukt', e);
  }
  try {
    ({ verplaatst, gemist } = await doorschuiven(undefined, vandaag));
  } catch (e) {
    console.error('[worker] doorschuiven mislukt', e);
  }
  console.log(`[worker] ${vandaag}: ${nieuw} herhaalde taken aangemaakt, ${verplaatst} doorgeschoven, ${gemist} gemist`);
}

async function backupRun(map: string): Promise<void> {
  await backupMetMelding({
    map, databaseUrl: process.env.DATABASE_URL, vandaag: vandaagInAmsterdam(), controle: opslagControleAan(), meld: meldStoring,
  });
}

async function bijlagenRun(map: string): Promise<void> {
  try {
    const r = await ruimBijlagenOp({ map });
    console.log(`[worker] bijlagen opgeruimd: ${r.oud} van oude taken, ${r.los} losse bestanden`);
  } catch (e) {
    console.error('[worker] bijlagen opruimen mislukt', e);
  }
}

/** Wacht tot de database antwoordt (bijv. na een herstart van de server); geeft na alle pogingen false terug. */
async function wachtOpDatabase(pogingen = 30, pauzeMs = 2000): Promise<boolean> {
  for (let i = 0; i < pogingen; i++) {
    try {
      await db()`select 1`;
      return true;
    } catch {
      if (i === 0) console.log('[worker] wachten op de database…');
      await new Promise((klaar) => setTimeout(klaar, pauzeMs));
    }
  }
  return false;
}

async function main(): Promise<void> {
  console.log('[worker] gestart; inhalen…');
  if (!(await wachtOpDatabase())) console.error('[worker] database niet bereikbaar');
  await nachtrun();
  cron.schedule('5 0 * * *', () => void nachtrun(), { timezone: 'Europe/Amsterdam', noOverlap: true });
  const backupMap = process.env.BACKUP_MAP;
  if (backupMap) {
    cron.schedule('0 3 * * *', () => void backupRun(backupMap), { timezone: 'Europe/Amsterdam', noOverlap: true });
    console.log(`[worker] back-ups om 03:00 naar ${backupMap}`);
  }
  const bijlagenMap = process.env.BIJLAGEN_MAP;
  if (bijlagenMap) {
    cron.schedule('30 3 * * *', () => void bijlagenRun(bijlagenMap), { timezone: 'Europe/Amsterdam', noOverlap: true });
    console.log(`[worker] bijlagen opruimen om 03:30 in ${bijlagenMap}`);
  }
}

void main();
