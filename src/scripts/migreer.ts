import { db, sluitDb } from '../lib/db/client';
import { migreer } from '../lib/db/migreer';

async function main() {
  const nieuw = await migreer(db());
  console.log(nieuw.length ? `Uitgevoerd: ${nieuw.join(', ')}` : 'Database is al bijgewerkt.');
  await sluitDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
