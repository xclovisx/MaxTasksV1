import { maakBeheerder } from '../../src/lib/auth/accounts';
import { maakSql, sluitDb } from '../../src/lib/db/client';
import { migreer } from '../../src/lib/db/migreer';
import { BEHEERDER, E2E_DATABASE_URL } from './gegevens';

function databaseNaam(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  } catch {
    return '';
  }
}

export default async function globalSetup() {
  const naam = databaseNaam(E2E_DATABASE_URL);
  if (!naam.endsWith('_e2e')) {
    throw new Error(
      `E2E_DATABASE_URL moet naar een database wijzen waarvan de naam op '_e2e' eindigt (nu: '${naam}'); de e2e-setup leegt het hele schema.`,
    );
  }
  process.env.DATABASE_URL = E2E_DATABASE_URL;
  const sql = maakSql(E2E_DATABASE_URL, { max: 1 });
  await sql.unsafe('drop schema public cascade; create schema public;').simple();
  await migreer(sql);
  await sql.end();
  await maakBeheerder(BEHEERDER.naam, BEHEERDER.gebruikersnaam, BEHEERDER.wachtwoord);
  await sluitDb();
}
