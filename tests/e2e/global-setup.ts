import { maakBeheerder } from '../../src/lib/auth/accounts';
import { maakSql, sluitDb } from '../../src/lib/db/client';
import { migreer } from '../../src/lib/db/migreer';
import { BEHEERDER, E2E_DATABASE_URL } from './gegevens';

export default async function globalSetup() {
  process.env.DATABASE_URL = E2E_DATABASE_URL;
  const sql = maakSql(E2E_DATABASE_URL, { max: 1 });
  await sql.unsafe('drop schema public cascade; create schema public;').simple();
  await migreer(sql);
  await sql.end();
  await maakBeheerder(BEHEERDER.naam, BEHEERDER.gebruikersnaam, BEHEERDER.wachtwoord);
  await sluitDb();
}
