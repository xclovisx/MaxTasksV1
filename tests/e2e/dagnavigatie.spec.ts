import { expect, test } from '@playwright/test';
import { plusDagen, vandaagInAmsterdam } from '../../src/lib/domein/datums';
import { BEHEERDER } from './gegevens';
import { inloggen } from './helpers';

test('de beheerder bladert op Vandaag naar andere dagen', async ({ page }) => {
  const vandaag = vandaagInAmsterdam();
  await inloggen(page, BEHEERDER.gebruikersnaam, BEHEERDER.wachtwoord);
  await expect(page).toHaveURL(/\/vandaag$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Vandaag');

  await page.getByRole('link', { name: 'Volgende dag' }).click();
  await expect(page).toHaveURL(new RegExp(`/vandaag\\?datum=${plusDagen(vandaag, 1)}$`));
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Morgen');

  await page.getByRole('link', { name: 'Vorige dag' }).click();
  await expect(page).toHaveURL(new RegExp(`/vandaag\\?datum=${plusDagen(vandaag, 0)}$`));
  await page.getByRole('link', { name: 'Vorige dag' }).click();
  await expect(page).toHaveURL(new RegExp(`datum=${plusDagen(vandaag, -1)}$`));
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Gisteren');

  const verderop = plusDagen(vandaag, 10);
  await page.getByLabel('Kies een datum').fill(verderop);
  await expect(page).toHaveURL(new RegExp(`datum=${verderop}$`));
  await expect(page.getByText(/Geen taken op deze dag|open tak/).first()).toBeVisible();

  await page.getByRole('navigation', { name: 'Dagnavigatie' }).getByRole('link', { name: 'Vandaag', exact: true }).click();
  await expect(page).toHaveURL(/\/vandaag$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Vandaag');
});
