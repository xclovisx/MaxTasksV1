import { expect, test } from '@playwright/test';
import { inloggen, maakMedewerker, maakOpgeslagenLocatie } from './helpers';

test('medewerker koppelt een opgeslagen locatie en kan erheen navigeren', async ({ page }) => {
  await maakOpgeslagenLocatie('Banden-Plus', 'Industrieweg 12, Breda', 51.589, 4.776);
  const mw = await maakMedewerker();
  await inloggen(page, mw.gebruikersnaam, mw.wachtwoord);
  await page.waitForURL(/\/bord\//);

  await page.getByRole('button', { name: 'Nieuwe taak' }).click();
  const dialoog = page.getByRole('dialog', { name: 'Nieuwe taak' });
  await dialoog.getByLabel('Titel').fill('Banden ophalen');
  await dialoog.getByLabel('Zoek adres of opgeslagen locatie').fill('band');
  await dialoog.getByRole('option', { name: /Banden-Plus/ }).click();
  await expect(dialoog.getByText('Industrieweg 12, Breda')).toBeVisible();
  await dialoog.getByRole('button', { name: 'Opslaan' }).click();
  await expect(dialoog).toBeHidden();

  const kaart = page.locator('[data-taak]', { hasText: 'Banden ophalen' });
  await expect(kaart).toContainText('Banden-Plus');
  await kaart.click();
  const link = page.getByRole('dialog', { name: 'Taak bewerken' }).getByRole('link', { name: 'Navigeer naar Banden-Plus' });
  await expect(link).toHaveAttribute('href', 'https://www.google.com/maps/dir/?api=1&destination=51.589%2C4.776&travelmode=driving');
});

test('zonder Google-sleutel geeft adres zoeken een nette melding', async ({ page }) => {
  const mw = await maakMedewerker();
  await inloggen(page, mw.gebruikersnaam, mw.wachtwoord);
  await page.waitForURL(/\/bord\//);
  await page.getByRole('button', { name: 'Nieuwe taak' }).click();
  const dialoog = page.getByRole('dialog', { name: 'Nieuwe taak' });
  await dialoog.getByLabel('Zoek adres of opgeslagen locatie').fill('Dorpsstraat 99');
  await expect(dialoog.getByText('Adres zoeken tijdelijk niet beschikbaar')).toBeVisible();
});
