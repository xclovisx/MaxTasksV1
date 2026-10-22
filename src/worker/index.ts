import cron from 'node-cron';
import { vandaagInAmsterdam } from '../lib/domein/datums';
import { doorschuiven } from './taken/doorschuiven';
import { genereerAlleHerhalingen } from './taken/herhalingen';

async function nachtrun(): Promise<void> {
  const vandaag = vandaagInAmsterdam();
  try {
    const nieuw = await genereerAlleHerhalingen(undefined, vandaag);
    const { verplaatst, gemist } = await doorschuiven(undefined, vandaag);
    console.log(`[worker] ${vandaag}: ${nieuw} herhaalde taken aangemaakt, ${verplaatst} doorgeschoven, ${gemist} gemist`);
  } catch (e) {
    console.error('[worker] nachtrun mislukt', e);
  }
}

async function main(): Promise<void> {
  console.log('[worker] gestart; inhalen…');
  await nachtrun();
  cron.schedule('5 0 * * *', () => void nachtrun(), { timezone: 'Europe/Amsterdam' });
}

void main();
