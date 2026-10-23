import { expect, test } from '@playwright/test';
import { eersteWerkdagVanaf, vandaagInAmsterdam, weekCode } from '../../src/lib/domein/datums';
import { inloggen, maakAfwezigheidInDb, maakMedewerker, verwijderAfwezigheidInDb } from './helpers';

test('medewerker ziet de afwezigheid op het bord en krijgt een waarschuwing bij het inplannen', async ({ page }) => {
  const dag = eersteWerkdagVanaf(vandaagInAmsterdam(), [1, 2, 3, 4, 5]);
  const id = await maakAfwezigheidInDb(dag, '13:00', '15:00', 'tandarts');
  try {
    const mw = await maakMedewerker();
    await inloggen(page, mw.gebruikersnaam, mw.wachtwoord);
    await page.waitForURL(/\/bord\//);
    await page.goto(`${new URL(page.url()).pathname}?week=${weekCode(dag)}`);

    const kolom = page.locator(`[data-dag="${dag}"]`);
    await expect(kolom.getByText('Max niet beschikbaar · 13:00–15:00 · tandarts')).toBeVisible();

    await kolom.getByRole('button', { name: /Taak toevoegen/ }).click();
    const dialoog = page.getByRole('dialog', { name: 'Nieuwe taak' });
    await expect(dialoog.getByText('Let op: Max is die dag van 13:00 tot 15:00 niet beschikbaar.')).toBeVisible();
    await dialoog.getByLabel('Tijd (optioneel)').fill('14:00');
    await expect(dialoog.getByText('Max is dan niet beschikbaar (tandarts).')).toBeVisible();
    await dialoog.getByLabel('Tijd (optioneel)').fill('16:00');
    await expect(dialoog.getByText('Max is dan niet beschikbaar (tandarts).')).toBeHidden();
  } finally {
    await verwijderAfwezigheidInDb(id);
  }
});
