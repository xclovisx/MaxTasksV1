import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { Conflict, NietGevonden } from '@/lib/fouten';
import { voerUit } from '@/lib/web/actie';

describe('voerUit', () => {
  afterEach(() => vi.restoreAllMocks());

  it('geeft data terug bij succes', async () => {
    expect(await voerUit(async () => 42)).toEqual({ ok: true, data: 42 });
  });

  it('zet domeinfouten, conflicten en validatiefouten om', async () => {
    expect(await voerUit(async () => { throw new NietGevonden('Taak niet gevonden'); })).toEqual({ ok: false, fout: 'Taak niet gevonden' });
    expect(await voerUit(async () => { throw new Conflict('Klaas'); }))
      .toEqual({ ok: false, fout: 'Deze taak is zojuist gewijzigd door Klaas. Herladen?', conflict: true });
    expect(await voerUit(async () => z.string().min(1, 'Titel is verplicht').parse(''))).toEqual({ ok: false, fout: 'Titel is verplicht' });
  });

  it('verbergt onverwachte fouten achter een foutcode', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await voerUit(async () => { throw new Error('database stuk'); });
    expect(r).toEqual({ ok: false, fout: expect.stringMatching(/^Er ging iets mis \(foutcode [0-9a-f]{8}\)/) });
  });

  it('gooit interne Next-fouten (redirect) door', async () => {
    const redirect = Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;replace;/login;307;' });
    await expect(voerUit(async () => { throw redirect; })).rejects.toBe(redirect);
  });
});
