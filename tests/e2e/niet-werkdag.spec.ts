import { expect, test } from '@playwright/test';
import { maakSql } from '../../src/lib/db/client';
import { maandagVan, plusDagen, vandaagInAmsterdam } from '../../src/lib/domein/datums';
import { E2E_DATABASE_URL } from './gegevens';
import { inloggen, maakMedewerker } from './helpers';

test('een taak op een niet-werkdag blijft zichtbaar op het weekbord', async ({ page }) => {
  const zaterdag = plusDagen(maandagVan(vandaagInAmsterdam()), 5);
  const sql = maakSql(E2E_DATABASE_URL, { max: 1 });
  const [bord] = await sql<{ id: string }[]>`select id from borden where not gearchiveerd order by naam limit 1`;
  await sql`insert into taken (bord_id, titel, datum, prioriteit, oorspronkelijke_datum)
    values (${bord.id}, 'Zaterdagklus', ${zaterdag}, 'middel', ${zaterdag})`;
  await sql.end();

  const mw = await maakMedewerker();
  await inloggen(page, mw.gebruikersnaam, mw.wachtwoord);
  await page.goto(`/bord/${bord.id}`);

  const kolom = page.locator(`[data-dag="${zaterdag}"]`);
  await expect(kolom).toBeVisible();
  await expect(kolom.getByText('geen werkdag')).toBeVisible();
  await expect(kolom.locator('[data-taak]', { hasText: 'Zaterdagklus' })).toBeVisible();
});
