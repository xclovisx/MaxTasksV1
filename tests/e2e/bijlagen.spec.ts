import { expect, test } from '@playwright/test';
import { inloggen, maakMedewerker, PNG_B64, png } from './helpers';

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

test('bijlage kiezen vóór het opslaan van een nieuwe taak', async ({ page }) => {
  const mw = await maakMedewerker();
  await inloggen(page, mw.gebruikersnaam, mw.wachtwoord);
  await page.waitForURL(/\/bord\//);
  await page.getByRole('button', { name: 'Nieuwe taak' }).click();
  const dialoog = page.getByRole('dialog', { name: 'Nieuwe taak' });
  await dialoog.getByLabel('Titel').fill('e2e-pakket-nieuw');
  await dialoog.getByLabel('Foto of bestand toevoegen').setInputFiles([png('a.png'), png('b.png')]);
  await expect(dialoog.getByText('a.jpg')).toBeVisible();
  await dialoog.getByRole('button', { name: 'Opslaan' }).click();
  await expect(dialoog).toBeHidden();
  await expect(page.locator('[data-taak]', { hasText: 'e2e-pakket-nieuw' }).getByTitle('Bijlagen')).toHaveText('2');
});

test('een gekozen bestand dat je weghaalt vóór het opslaan wordt niet geüpload', async ({ page }) => {
  const mw = await maakMedewerker();
  await inloggen(page, mw.gebruikersnaam, mw.wachtwoord);
  await page.waitForURL(/\/bord\//);
  await page.getByRole('button', { name: 'Nieuwe taak' }).click();
  const dialoog = page.getByRole('dialog', { name: 'Nieuwe taak' });
  await dialoog.getByLabel('Titel').fill('e2e-pakket-weghalen-nieuw');
  await dialoog.getByLabel('Foto of bestand toevoegen').setInputFiles([png('houd.png'), png('weg.png')]);
  await expect(dialoog.getByText('weg.jpg')).toBeVisible();
  await dialoog.getByRole('button', { name: 'weg.jpg weghalen' }).click();
  await dialoog.getByRole('button', { name: 'Opslaan' }).click();
  await expect(dialoog).toBeHidden();
  await expect(page.locator('[data-taak]', { hasText: 'e2e-pakket-weghalen-nieuw' }).getByTitle('Bijlagen')).toHaveText('1');
});

test('een screenshot plakken met Ctrl+V wordt een bijlage', async ({ page }) => {
  const mw = await maakMedewerker();
  await inloggen(page, mw.gebruikersnaam, mw.wachtwoord);
  await page.waitForURL(/\/bord\//);
  await page.getByRole('button', { name: 'Nieuwe taak' }).click();
  const nieuw = page.getByRole('dialog', { name: 'Nieuwe taak' });
  await nieuw.getByLabel('Titel').fill('e2e-pakket-plakken');
  await nieuw.getByRole('button', { name: 'Opslaan' }).click();
  await page.locator('[data-taak]', { hasText: 'e2e-pakket-plakken' }).click();
  const dialoog = page.getByRole('dialog', { name: 'Taak bewerken' });

  await dialoog.evaluate((el, b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'image.png', { type: 'image/png' }));
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, PNG_B64);

  await expect(dialoog.getByRole('link', { name: /^Schermafbeelding \d{2}-\d{2} \d{2}\.\d{2}\.jpg$/ })).toBeVisible();
});

test('tekst plakken in de titel blijft gewoon tekst', async ({ page }) => {
  const mw = await maakMedewerker();
  await inloggen(page, mw.gebruikersnaam, mw.wachtwoord);
  await page.waitForURL(/\/bord\//);
  await page.getByRole('button', { name: 'Nieuwe taak' }).click();
  const dialoog = page.getByRole('dialog', { name: 'Nieuwe taak' });
  const titel = dialoog.getByLabel('Titel');
  await titel.focus();
  await titel.evaluate((el) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', 'geplakt');
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await expect(dialoog.getByRole('list', { name: 'Bijlagen' })).toHaveCount(0);
});

test('plakken met tekst én afbeelding in een tekstveld blijft tekst (Excel of Word)', async ({ page }) => {
  const mw = await maakMedewerker();
  await inloggen(page, mw.gebruikersnaam, mw.wachtwoord);
  await page.waitForURL(/\/bord\//);
  await page.getByRole('button', { name: 'Nieuwe taak' }).click();
  const dialoog = page.getByRole('dialog', { name: 'Nieuwe taak' });
  const titel = dialoog.getByLabel('Titel');
  await titel.focus();
  const nietGeannuleerd = await titel.evaluate((el, b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.setData('text/plain', 'cellen');
    dt.items.add(new File([bytes], 'image.png', { type: 'image/png' }));
    return el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, PNG_B64);
  expect(nietGeannuleerd).toBe(true);
  await expect(dialoog.getByRole('list', { name: 'Bijlagen' })).toHaveCount(0);
});

test('na een mislukte upload van een nieuwe taak gaan alleen de bijlagen opnieuw, zonder tweede taak', async ({ page }) => {
  const mw = await maakMedewerker();
  await inloggen(page, mw.gebruikersnaam, mw.wachtwoord);
  await page.waitForURL(/\/bord\//);
  await page.getByRole('button', { name: 'Nieuwe taak' }).click();
  const dialoog = page.getByRole('dialog', { name: 'Nieuwe taak' });
  const titel = dialoog.getByLabel('Titel');
  await titel.fill('e2e-pakket-opnieuw');
  await dialoog.getByLabel('Foto of bestand toevoegen').setInputFiles(png('x.png'));
  await expect(dialoog.getByText('x.jpg')).toBeVisible();

  await page.route('**/api/taken/*/bijlagen', (r) => r.fulfill({
    status: 503, contentType: 'application/json', body: JSON.stringify({ fout: 'Opslagschijf niet gevonden, waarschuw de beheerder.' }),
  }));
  await dialoog.getByRole('button', { name: 'Opslaan' }).click();

  await expect(dialoog.getByText('De taak is opgeslagen, maar niet alle bijlagen zijn geüpload.')).toBeVisible();
  await expect(dialoog.getByText('Opslagschijf niet gevonden, waarschuw de beheerder.')).toBeVisible();
  await expect(titel).toBeDisabled();
  await expect(dialoog.getByLabel('Omschrijving (optioneel)')).toBeDisabled();
  await expect(dialoog.getByLabel('Dag', { exact: true })).toBeDisabled();
  await expect(dialoog.getByLabel('Tijd (optioneel)')).toBeDisabled();
  await expect(dialoog.getByRole('button', { name: 'Hoog' })).toBeDisabled();
  await expect(dialoog.getByLabel('Herhalen')).toBeDisabled();
  await expect(dialoog.getByRole('button', { name: 'Opslaan', exact: true })).toHaveCount(0);

  await page.unroute('**/api/taken/*/bijlagen');
  await dialoog.getByRole('button', { name: 'Opnieuw uploaden' }).click();
  await expect(dialoog).toBeHidden();

  const kaarten = page.locator('[data-taak]', { hasText: 'e2e-pakket-opnieuw' });
  await expect(kaarten).toHaveCount(1);
  await expect(kaarten.getByTitle('Bijlagen')).toHaveText('1');
});

test('een bestand loslaten naast het taakvenster voegt het toe in plaats van weg te navigeren', async ({ page }) => {
  const mw = await maakMedewerker();
  await inloggen(page, mw.gebruikersnaam, mw.wachtwoord);
  await page.waitForURL(/\/bord\//);
  await page.getByRole('button', { name: 'Nieuwe taak' }).click();
  const dialoog = page.getByRole('dialog', { name: 'Nieuwe taak' });
  await dialoog.getByLabel('Titel').fill('e2e-pakket-slepen-naast');
  const overlay = dialoog.locator('xpath=..');

  const resultaat = await overlay.evaluate((el, b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'sleep.png', { type: 'image/png' }));
    const over = el.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
    const drop = el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    return { overGeannuleerd: !over, dropGeannuleerd: !drop };
  }, PNG_B64);

  expect(resultaat).toEqual({ overGeannuleerd: true, dropGeannuleerd: true });
  await expect(dialoog.getByText('sleep.jpg')).toBeVisible();
});
