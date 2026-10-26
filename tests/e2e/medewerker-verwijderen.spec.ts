import { expect, test } from '@playwright/test';
import { BEHEERDER } from './gegevens';
import { inloggen } from './helpers';

test('beheerder verwijdert een medewerker na bevestiging', async ({ page }) => {
  await inloggen(page, BEHEERDER.gebruikersnaam, BEHEERDER.wachtwoord);
  await page.goto('/beheer/medewerkers');
  const nieuwMw = page.getByRole('region', { name: 'Nieuwe medewerker' });
  await nieuwMw.getByLabel('Naam', { exact: true }).fill('Kees Weg');
  await nieuwMw.getByLabel('Gebruikersnaam').fill('e2e-kees-weg');
  await nieuwMw.getByRole('button', { name: 'Medewerker toevoegen' }).click();
  await expect(page.getByLabel('Activatielink')).toBeVisible();

  const rij = page.getByRole('listitem').filter({ hasText: '@e2e-kees-weg' });
  page.once('dialog', (d) => d.dismiss());
  await rij.getByRole('button', { name: 'Verwijderen' }).click();
  await expect(rij).toBeVisible();

  page.once('dialog', (d) => d.accept());
  await rij.getByRole('button', { name: 'Verwijderen' }).click();
  await expect(rij).toHaveCount(0);
});
