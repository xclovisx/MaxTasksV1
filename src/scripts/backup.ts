import { vandaagInAmsterdam } from '../lib/domein/datums';
import { maakBackup } from '../worker/taken/backup';

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL ontbreekt');
  const r = await maakBackup({ map: process.env.BACKUP_MAP ?? 'backups', databaseUrl, vandaag: vandaagInAmsterdam() });
  console.log(`Back-up gemaakt: ${r.bestand}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
