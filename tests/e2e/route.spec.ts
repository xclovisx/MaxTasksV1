import { expect, type Page, test } from '@playwright/test';
import { inloggen, maakMedewerker, maakTaakMetStops, zetGarage } from './helpers';

const STOPS = [
  { naam: 'Stop Noord', adres: 'Noordweg 1, Breda', lat: 51.51, lng: 4.71 },
  { naam: 'Stop Zuid', adres: 'Zuidweg 2, Breda', lat: 51.52, lng: 4.72 },
];

async function openTaak(page: Page, titel: string) {
  const mw = await maakMedewerker();
  await inloggen(page, mw.gebruikersnaam, mw.wachtwoord);
  await page.waitForURL(/\/bord\//);
  await page.locator('[data-taak]', { hasText: titel }).click();
  return page.getByRole('dialog', { name: 'Taak bewerken' });
}

test.describe('met toestemming voor de locatie', () => {
  test.use({ geolocation: { latitude: 51.6, longitude: 4.8 }, permissions: ['geolocation'] });

  test('plant een route; zonder Google valt hij terug op de ingevoerde volgorde', async ({ page }) => {
    await zetGarage(51.55, 4.7);
    await maakTaakMetStops('Ronde met locatie', STOPS);
    const dialoog = await openTaak(page, 'Ronde met locatie');
    await expect(dialoog.getByRole('link', { name: 'Navigeer naar Stop Noord' })).toBeVisible();
    await dialoog.getByRole('button', { name: 'Plan route' }).click();
    await expect(dialoog.getByText('Volgorde kon niet berekend worden')).toBeVisible({ timeout: 15_000 });
    await expect(dialoog.getByRole('link', { name: 'Start route in Google Maps' })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/dir/?api=1&origin=51.6%2C4.8&destination=51.55%2C4.7&waypoints=51.51%2C4.71%7C51.52%2C4.72&travelmode=driving',
    );
  });
});

test('zonder toestemming voor de locatie start de route bij de garage', async ({ page }) => {
  await zetGarage(51.55, 4.7);
  await maakTaakMetStops('Ronde zonder locatie', STOPS);
  const dialoog = await openTaak(page, 'Ronde zonder locatie');
  await dialoog.getByRole('button', { name: 'Plan route' }).click();
  await expect(dialoog.getByText('De route start bij de garage')).toBeVisible({ timeout: 15_000 });
  await expect(dialoog.getByRole('link', { name: 'Start route in Google Maps' })).toHaveAttribute(
    'href',
    'https://www.google.com/maps/dir/?api=1&origin=51.55%2C4.7&destination=51.55%2C4.7&waypoints=51.51%2C4.71%7C51.52%2C4.72&travelmode=driving',
  );
});
