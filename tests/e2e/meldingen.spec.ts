import { expect, test } from '@playwright/test';
import { BEHEERDER } from './gegevens';
import { inloggen } from './helpers';

test('beheerder stelt het meldingsonderwerp in; zonder server zegt de testmelding dat', async ({ page }) => {
  await inloggen(page, BEHEERDER.gebruikersnaam, BEHEERDER.wachtwoord);
  await page.goto('/beheer/instellingen');
  const paneel = page.getByRole('region', { name: 'Meldingen' });
  await expect(paneel.getByText('NTFY_URL is nog niet ingesteld')).toBeVisible();

  await paneel.getByLabel('ntfy-onderwerp').fill('garage-max-e2e');
  await paneel.getByRole('button', { name: 'Opslaan' }).click();
  await expect(paneel.getByText('Opgeslagen')).toBeVisible();

  await paneel.getByRole('button', { name: 'Stuur testmelding' }).click();
  await expect(paneel.getByText('Meldingen zijn niet ingesteld')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('region', { name: 'Meldingen' }).getByLabel('ntfy-onderwerp')).toHaveValue('garage-max-e2e');
});
