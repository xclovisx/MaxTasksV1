import cron from 'node-cron';
import { vandaagInAmsterdam } from '../lib/domein/datums';
import { maakBackup } from './taken/backup';
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
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('[worker] back-up mislukt: DATABASE_URL ontbreekt');
    return;
  }
  try {
    const r = await maakBackup({ map, databaseUrl, vandaag: vandaagInAmsterdam() });
    console.log(`[worker] back-up gemaakt: ${r.bestand}${r.verwijderd.length ? `, ${r.verwijderd.length} oude verwijderd` : ''}`);
  } catch (e) {
    console.error('[worker] back-up mislukt', e);
  }
}

async function main(): Promise<void> {
  console.log('[worker] gestart; inhalen…');
  await nachtrun();
  cron.schedule('5 0 * * *', () => void nachtrun(), { timezone: 'Europe/Amsterdam', noOverlap: true });
  const backupMap = process.env.BACKUP_MAP;
  if (backupMap) {
    cron.schedule('0 3 * * *', () => void backupRun(backupMap), { timezone: 'Europe/Amsterdam', noOverlap: true });
    console.log(`[worker] back-ups om 03:00 naar ${backupMap}`);
  }
}

void main();
