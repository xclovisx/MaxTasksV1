import { expect, test } from '@playwright/test';
import { inloggen, maakMedewerker } from './helpers';

test('een kaart naar een andere dag slepen blijft bewaard', async ({ page }) => {
  const mw = await maakMedewerker();
  await inloggen(page, mw.gebruikersnaam, mw.wachtwoord);
  await page.waitForURL(/\/bord\//);

  const dagen = page.locator('[data-dag]');
  const eerste = dagen.nth(0);
  const tweede = dagen.nth(1);
  const tweedeDatum = await tweede.getAttribute('data-dag');

  await eerste.getByRole('button', { name: /Taak toevoegen/ }).click();
  const dialoog = page.getByRole('dialog', { name: 'Nieuwe taak' });
  await dialoog.getByLabel('Titel').fill('Sleeptaak');
  await dialoog.getByRole('button', { name: 'Opslaan' }).click();
  await expect(dialoog).toBeHidden();

  const kaart = eerste.locator('[data-taak]', { hasText: 'Sleeptaak' });
  await expect(kaart).toBeVisible();
  const van = await kaart.boundingBox();
  const naar = await tweede.boundingBox();
  if (!van || !naar) throw new Error('geen afmetingen');

  // De kaart verschijnt meteen op de nieuwe dag (optimistisch); wacht daarom op de serveractie voor we herladen.
  const opgeslagen = page.waitForResponse((r) => r.request().method() === 'POST' && 'next-action' in r.request().headers());
  await page.mouse.move(van.x + van.width / 2, van.y + van.height / 2);
  await page.mouse.down();
  await page.mouse.move(van.x + van.width / 2 + 20, van.y + van.height / 2, { steps: 5 });
  await page.mouse.move(naar.x + naar.width / 2, naar.y + 80, { steps: 15 });
  await page.mouse.up();

  const verplaatst = page.locator(`[data-dag="${tweedeDatum}"] [data-taak]`, { hasText: 'Sleeptaak' });
  await expect(verplaatst).toBeVisible();
  await opgeslagen;
  await page.reload();
  await expect(page.locator(`[data-dag="${tweedeDatum}"] [data-taak]`, { hasText: 'Sleeptaak' })).toBeVisible();
});
