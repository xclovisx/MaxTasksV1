import { expect, test } from '@playwright/test';
import { inloggen, maakMedewerker, png } from './helpers';

test('bijlage toevoegen aan een bestaande taak, bekijken en verwijderen', async ({ page }) => {
  const mw = await maakMedewerker();
  await inloggen(page, mw.gebruikersnaam, mw.wachtwoord);
  await page.waitForURL(/\/bord\//);

  await page.getByRole('button', { name: 'Nieuwe taak' }).click();
  const nieuw = page.getByRole('dialog', { name: 'Nieuwe taak' });
  await nieuw.getByLabel('Titel').fill('e2e-pakket-bestaand');
  await nieuw.getByRole('button', { name: 'Opslaan' }).click();
  await expect(nieuw).toBeHidden();

  const kaart = page.locator('[data-taak]', { hasText: 'e2e-pakket-bestaand' });
  await kaart.click();
  const dialoog = page.getByRole('dialog', { name: 'Taak bewerken' });
  await dialoog.getByLabel('Foto of bestand toevoegen').setInputFiles(png('qr-postnl.png'));

  const link = dialoog.getByRole('link', { name: 'qr-postnl.jpg' });
  await expect(link).toBeVisible();
  const href = await link.getAttribute('href');
  expect(href).toMatch(/^\/api\/bijlagen\/[0-9a-f-]{36}$/);
  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toBe('image/jpeg');

  await expect(kaart.getByTitle('Bijlagen')).toHaveText('1');

  page.once('dialog', (d) => d.accept());
  await dialoog.getByRole('button', { name: 'qr-postnl.jpg verwijderen' }).click();
  await expect(link).toBeHidden();
  await expect(kaart.getByTitle('Bijlagen')).toHaveCount(0);
});

test('een niet-toegestaan bestand geeft een melding bij die bijlage', async ({ page }) => {
  const mw = await maakMedewerker();
  await inloggen(page, mw.gebruikersnaam, mw.wachtwoord);
  await page.waitForURL(/\/bord\//);
  await page.getByRole('button', { name: 'Nieuwe taak' }).click();
  const nieuw = page.getByRole('dialog', { name: 'Nieuwe taak' });
  await nieuw.getByLabel('Titel').fill('e2e-pakket-fout');
  await nieuw.getByRole('button', { name: 'Opslaan' }).click();
  await page.locator('[data-taak]', { hasText: 'e2e-pakket-fout' }).click();
  const dialoog = page.getByRole('dialog', { name: 'Taak bewerken' });
  await dialoog.getByLabel('Foto of bestand toevoegen').setInputFiles({ name: 'notities.txt', mimeType: 'text/plain', buffer: Buffer.from('hoi') });
  await expect(dialoog.getByText("Dit bestandstype kan niet (alleen foto's en PDF's).")).toBeVisible();
});

test('een afgekeurd bestand is weg te halen uit de lijst', async ({ page }) => {
  const mw = await maakMedewerker();
  await inloggen(page, mw.gebruikersnaam, mw.wachtwoord);
  await page.waitForURL(/\/bord\//);
  await page.getByRole('button', { name: 'Nieuwe taak' }).click();
  const nieuw = page.getByRole('dialog', { name: 'Nieuwe taak' });
  await nieuw.getByLabel('Titel').fill('e2e-pakket-weghalen');
  await nieuw.getByRole('button', { name: 'Opslaan' }).click();
  await page.locator('[data-taak]', { hasText: 'e2e-pakket-weghalen' }).click();
  const dialoog = page.getByRole('dialog', { name: 'Taak bewerken' });
  await dialoog.getByLabel('Foto of bestand toevoegen').setInputFiles({ name: 'notities.txt', mimeType: 'text/plain', buffer: Buffer.from('hoi') });
  await expect(dialoog.getByText('notities.txt', { exact: true })).toBeVisible();
  await dialoog.getByRole('button', { name: 'notities.txt weghalen' }).click();
  await expect(dialoog.getByText('notities.txt', { exact: true })).toHaveCount(0);
});
