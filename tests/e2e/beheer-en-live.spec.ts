import { expect, test } from '@playwright/test';
import { BEHEERDER } from './gegevens';
import { inloggen } from './helpers';

test('beheerder stelt de garage in, medewerker activeert en taken komen live binnen', async ({ page, browser }) => {
  await inloggen(page, BEHEERDER.gebruikersnaam, BEHEERDER.wachtwoord);
  await expect(page).toHaveURL(/\/vandaag$/);

  // Garagenaam instellen
  await page.goto('/beheer/instellingen');
  const garage = page.getByRole('region', { name: 'Garage' });
  await garage.getByLabel('Naam', { exact: true }).fill('Garage Jansen');
  await garage.getByRole('button', { name: 'Opslaan' }).click();
  await expect(page.getByText('Opgeslagen').first()).toBeVisible();

  // Medewerker aanmaken
  await page.goto('/beheer/medewerkers');
  const nieuwMw = page.getByRole('region', { name: 'Nieuwe medewerker' });
  await nieuwMw.getByLabel('Naam', { exact: true }).fill('Piet de Vries');
  await nieuwMw.getByLabel('Gebruikersnaam').fill('piet');
  await nieuwMw.getByRole('button', { name: 'Medewerker toevoegen' }).click();
  const link = await page.getByLabel('Activatielink').inputValue();
  expect(link).toMatch(/\/activeren\//);

  // Medewerker activeert in een eigen browsercontext
  const pietContext = await browser.newContext();
  const piet = await pietContext.newPage();
  await piet.goto(link);
  await piet.getByLabel('Nieuw wachtwoord').fill('piet-wachtwoord-1');
  await piet.getByLabel('Herhaal wachtwoord').fill('piet-wachtwoord-1');
  await piet.getByRole('button', { name: 'Wachtwoord instellen' }).click();
  await piet.waitForURL(/\/bord\//);

  // Beheerder opent hetzelfde bord
  await page.goto(new URL(piet.url()).pathname);
  await expect(page.locator('[data-dag]').first()).toBeVisible();

  // Piet maakt een taak met prioriteit Nu
  await piet.getByRole('button', { name: 'Nieuwe taak' }).click();
  const dialoog = piet.getByRole('dialog', { name: 'Nieuwe taak' });
  await dialoog.getByLabel('Titel').fill('Ruitenwisser klant');
  await dialoog.getByRole('button', { name: 'Nu', exact: true }).click();
  await dialoog.getByRole('button', { name: 'Opslaan' }).click();
  await expect(dialoog).toBeHidden();

  // De beheerder ziet hem zonder herladen
  const kaartBijMax = page.locator('[data-taak]', { hasText: 'Ruitenwisser klant' });
  await expect(kaartBijMax).toBeVisible({ timeout: 10_000 });
  await expect(kaartBijMax.getByText('NU', { exact: true })).toBeVisible();

  // De beheerder zet hem op Bezig; Piet ziet dat live
  await kaartBijMax.click();
  await page.getByRole('dialog', { name: 'Taak bewerken' }).getByRole('button', { name: 'Bezig', exact: true }).click();
  const kaartBijPiet = piet.locator('[data-taak]', { hasText: 'Ruitenwisser klant' });
  await expect(kaartBijPiet.getByText('Bezig', { exact: true })).toBeVisible({ timeout: 10_000 });

  // Piet krijgt geen statusknoppen
  await kaartBijPiet.click();
  const pietDialoog = piet.getByRole('dialog', { name: 'Taak bewerken' });
  await expect(pietDialoog).toBeVisible();
  await expect(pietDialoog.getByRole('group', { name: 'Status' })).toHaveCount(0);

  await pietContext.close();
});
