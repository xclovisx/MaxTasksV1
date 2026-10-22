import { expect, type Page } from '@playwright/test';
import { hashWachtwoord } from '../../src/lib/auth/wachtwoord';
import { maakSql } from '../../src/lib/db/client';
import { E2E_DATABASE_URL } from './gegevens';

export async function inloggen(page: Page, gebruikersnaam: string, wachtwoord: string) {
  await page.goto('/login');
  await page.getByLabel('Gebruikersnaam').fill(gebruikersnaam);
  await page.getByLabel('Wachtwoord').fill(wachtwoord);
  await page.getByRole('button', { name: 'Inloggen' }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** Zet direct in de database een geactiveerde medewerker klaar (het bord is het standaardbord uit de migratie). */
export async function maakMedewerker(): Promise<{ gebruikersnaam: string; wachtwoord: string }> {
  const sql = maakSql(E2E_DATABASE_URL, { max: 1 });
  const gebruikersnaam = `mw${Date.now()}`;
  const wachtwoord = 'e2e-medewerker-wachtwoord';
  await sql`insert into gebruikers (naam, gebruikersnaam, wachtwoord_hash, rol)
    values ('Test Medewerker', ${gebruikersnaam}, ${await hashWachtwoord(wachtwoord)}, 'medewerker')`;
  await sql.end();
  return { gebruikersnaam, wachtwoord };
}

export async function maakOpgeslagenLocatie(naam: string, adres: string, lat: number, lng: number): Promise<void> {
  const sql = maakSql(E2E_DATABASE_URL, { max: 1 });
  await sql`insert into locaties (naam, adres, lat, lng) values (${naam}, ${adres}, ${lat}, ${lng})`;
  await sql.end();
}
