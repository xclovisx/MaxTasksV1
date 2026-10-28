import { expect, type Page } from '@playwright/test';
import { hashWachtwoord } from '../../src/lib/auth/wachtwoord';
import { maakSql } from '../../src/lib/db/client';
import { vandaagInAmsterdam } from '../../src/lib/domein/datums';
import { codePng } from '../codes-helper';
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

export async function zetGarage(lat: number, lng: number): Promise<void> {
  const sql = maakSql(E2E_DATABASE_URL, { max: 1 });
  await sql`update instellingen set garage_adres = 'Dorpsstraat 1, Rijsbergen', garage_lat = ${lat}, garage_lng = ${lng}`;
  await sql.end();
}

export async function maakAfwezigheidInDb(datum: string, van: string, tot: string, reden: string): Promise<string> {
  const sql = maakSql(E2E_DATABASE_URL, { max: 1 });
  const [r] = await sql<{ id: string }[]>`
    insert into afwezigheden (begindatum, hele_dag, van, tot, reden) values (${datum}, false, ${van}, ${tot}, ${reden}) returning id`;
  await sql.end();
  return r.id;
}

export async function verwijderAfwezigheidInDb(id: string): Promise<void> {
  const sql = maakSql(E2E_DATABASE_URL, { max: 1 });
  await sql`delete from afwezigheden where id = ${id}`;
  await sql.end();
}

/** Zet vandaag een taak met stops op het eerste bord. */
export async function maakTaakMetStops(titel: string, stops: { naam: string; adres: string; lat: number; lng: number }[]): Promise<void> {
  const sql = maakSql(E2E_DATABASE_URL, { max: 1 });
  const datum = vandaagInAmsterdam();
  const [bord] = await sql<{ id: string }[]>`select id from borden where not gearchiveerd order by aangemaakt_op limit 1`;
  const [taak] = await sql<{ id: string }[]>`
    insert into taken (bord_id, titel, datum, prioriteit, oorspronkelijke_datum)
    values (${bord.id}, ${titel}, ${datum}, 'middel', ${datum}) returning id`;
  for (const [i, s] of stops.entries()) {
    await sql`insert into taak_stops (taak_id, volgorde, naam, adres, lat, lng)
      values (${taak.id}, ${i + 1}, ${s.naam}, ${s.adres}, ${s.lat}, ${s.lng})`;
  }
  await sql.end();
}

/** Een geldige PNG van 1×1 pixel. */
export const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
export const png = (name: string) => ({ name, mimeType: 'image/png', buffer: Buffer.from(PNG_B64, 'base64') });

export async function qrPng(name: string, tekst: string) {
  return { name, mimeType: 'image/png', buffer: Buffer.from(await codePng('QRCode', tekst, 8)) };
}

export async function streepPng(name: string, tekst: string) {
  return { name, mimeType: 'image/png', buffer: Buffer.from(await codePng('Code128', tekst, 4)) };
}
