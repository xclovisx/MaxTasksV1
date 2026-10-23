import { expect, test } from '@playwright/test';
import { BEHEERDER } from './gegevens';
import { inloggen } from './helpers';

test('beheerder legt een blok vast, past het aan en verwijdert het', async ({ page }) => {
  await inloggen(page, BEHEERDER.gebruikersnaam, BEHEERDER.wachtwoord);
  await page.getByRole('link', { name: 'Beschikbaarheid' }).click();
  await expect(page).toHaveURL(/\/beschikbaarheid$/);

  const nieuw = page.getByRole('region', { name: 'Nieuw blok' });
  await nieuw.getByLabel('Begindatum', { exact: true }).fill('2030-01-07');
  await nieuw.getByLabel('Hele dag').uncheck();
  await nieuw.getByLabel('Van', { exact: true }).fill('09:00');
  await nieuw.getByLabel('Tot', { exact: true }).fill('10:30');
  await nieuw.getByLabel('Reden').fill('e2e-overleg');
  await nieuw.getByLabel('Herhalen').selectOption('wekelijks');
  await nieuw.getByRole('button', { name: 'Blok toevoegen' }).click();

  const blokken = page.getByRole('region', { name: 'Blokken' });
  const regel = blokken.getByRole('listitem').filter({ hasText: 'e2e-overleg' });
  await expect(regel).toContainText('vanaf ma 7 jan');
  await expect(regel).toContainText('09:00–10:30');
  await expect(regel).toContainText('Wekelijks');

  await regel.getByRole('button', { name: 'Wijzigen' }).click();
  await blokken.getByLabel('Reden').fill('e2e-overleg-2');
  await blokken.getByRole('button', { name: 'Opslaan' }).click();
  await expect(blokken.getByText('e2e-overleg-2')).toBeVisible();

  page.once('dialog', (d) => d.accept());
  await blokken.getByRole('listitem').filter({ hasText: 'e2e-overleg-2' }).getByRole('button', { name: 'Verwijderen' }).click();
  await expect(blokken.getByText('e2e-overleg-2')).toHaveCount(0);
});
