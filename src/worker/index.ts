import cron from 'node-cron';
import { vandaagInAmsterdam } from '../lib/domein/datums';
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

async function main(): Promise<void> {
  console.log('[worker] gestart; inhalen…');
  await nachtrun();
  cron.schedule('5 0 * * *', () => void nachtrun(), { timezone: 'Europe/Amsterdam', noOverlap: true });
}

void main();
