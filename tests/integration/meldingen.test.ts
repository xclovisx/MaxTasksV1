import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import type { Context } from '../../src/lib/context';
import { haalNtfyOnderwerp, meldStoring, stuurTestmelding, wijzigNtfyOnderwerp } from '../../src/lib/diensten/meldingen';
import { haalTaak, maakTaak, wijzigTaak } from '../../src/lib/diensten/taken';
import type { Prioriteit } from '../../src/lib/domein/taak';
import { GeenToegang } from '../../src/lib/fouten';
import { NtfyMislukt, NtfyNietIngesteld } from '../../src/lib/meldingen/ntfy';
import { leegDatabase, maakBeheerderCtx, maakBord, maakMedewerkerCtx } from './helpers';

let beheerder: Context;
let piet: Context;
let bordId: string;
let haal: MockInstance<typeof fetch>;
const oudeAppUrl = process.env.APP_URL;

const nieuw = (titel: string, prioriteit: Prioriteit) =>
  ({ bordId, herhaling: null, titel, omschrijving: '', datum: '2026-11-02', tijd: '09:30', prioriteit, stops: [] });
const verzonden = () => haal.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));

beforeEach(async () => {
  await leegDatabase();
  beheerder = await maakBeheerderCtx();
  piet = await maakMedewerkerCtx('piet', 'Piet');
  bordId = await maakBord('Werkplaats');
  process.env.NTFY_URL = 'https://ntfy.test';
  process.env.APP_URL = 'https://bord.test';
  delete process.env.NTFY_TOKEN;
  await wijzigNtfyOnderwerp(beheerder, 'garage-max');
  haal = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('{}'));
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.NTFY_URL;
  if (oudeAppUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = oudeAppUrl;
});

describe('pushmeldingen', () => {
  it('een nieuwe Nu-taak van een medewerker geeft een melding', async () => {
    await maakTaak(piet, nieuw('Klant wacht', 'nu'));
    expect(verzonden()).toEqual([{
      topic: 'garage-max', title: 'Nu: Klant wacht', message: 'Werkplaats · maandag 2 nov om 09:30', priority: 5,
      tags: ['rotating_light'], click: 'https://bord.test/vandaag?datum=2026-11-02',
    }]);
  });

  it('een nieuwe reeks met Nu geeft één melding', async () => {
    await maakTaak(piet, { ...nieuw('Elke ochtend', 'nu'), herhaling: { type: 'dagelijks', weekdagen: [], intervalWeken: 1 } });
    expect(haal).toHaveBeenCalledTimes(1);
  });

  it('geen melding bij een lagere prioriteit of als de beheerder de taak maakt', async () => {
    await maakTaak(piet, nieuw('Gewoon', 'hoog'));
    await maakTaak(beheerder, nieuw('Zelf gemaakt', 'nu'));
    expect(haal).not.toHaveBeenCalled();
  });

  it('meldt een verhoging naar zsm en van zsm naar nu, niet een verlaging', async () => {
    const { id } = await maakTaak(piet, nieuw('Banden', 'middel'));
    const wijzig = async (prioriteit: Prioriteit) => {
      const t = await haalTaak(id);
      await wijzigTaak(piet, id, t.versie, { titel: t.titel, omschrijving: t.omschrijving, datum: t.datum, tijd: t.tijd, prioriteit, stops: [] });
    };
    await wijzig('zsm');
    await wijzig('nu');
    await wijzig('zsm');
    expect(verzonden().map((b) => b.title)).toEqual(['Zo snel mogelijk: Banden', 'Nu: Banden']);
  });

  it('zonder onderwerp of zonder server: geen melding', async () => {
    await wijzigNtfyOnderwerp(beheerder, '');
    expect(await haalNtfyOnderwerp()).toBeNull();
    await maakTaak(piet, nieuw('A', 'nu'));
    await wijzigNtfyOnderwerp(beheerder, 'garage-max');
    delete process.env.NTFY_URL;
    await maakTaak(piet, nieuw('B', 'nu'));
    expect(haal).not.toHaveBeenCalled();
  });

  it('een mislukte melding wordt gelogd en de taak blijft bewaard', async () => {
    haal.mockRejectedValue(new Error('ntfy plat'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { id } = await maakTaak(piet, nieuw('Toch bewaard', 'nu'));
    expect((await haalTaak(id)).titel).toBe('Toch bewaard');
    expect(log).toHaveBeenCalledWith('[ntfy] melding versturen mislukt', expect.any(Error));
  });

  it('onderwerp en testmelding zijn alleen voor de beheerder', async () => {
    await expect(wijzigNtfyOnderwerp(piet, 'iets')).rejects.toBeInstanceOf(GeenToegang);
    await expect(wijzigNtfyOnderwerp(beheerder, 'met spatie')).rejects.toThrow('Onderwerp');
    await expect(stuurTestmelding(piet)).rejects.toBeInstanceOf(GeenToegang);
    await stuurTestmelding(beheerder);
    expect(verzonden()[0]).toMatchObject({ topic: 'garage-max', title: 'Testmelding' });
  });

  it('de testmelding zegt het als meldingen niet ingesteld zijn of mislukken', async () => {
    await wijzigNtfyOnderwerp(beheerder, '');
    await expect(stuurTestmelding(beheerder)).rejects.toBeInstanceOf(NtfyNietIngesteld);
    await wijzigNtfyOnderwerp(beheerder, 'garage-max');
    haal.mockResolvedValue(new Response('', { status: 500 }));
    await expect(stuurTestmelding(beheerder)).rejects.toBeInstanceOf(NtfyMislukt);
  });
});

describe('storingsmelding', () => {
  it('stuurt een melding naar het ingestelde onderwerp', async () => {
    await meldStoring('Back-up mislukt', 'Back-up van het takenbord mislukt: x');
    expect(verzonden()).toEqual([expect.objectContaining({ topic: 'garage-max', title: 'Back-up mislukt', message: 'Back-up van het takenbord mislukt: x' })]);
  });

  it('doet niets zonder onderwerp of server, en gooit nooit', async () => {
    delete process.env.NTFY_URL;
    await meldStoring('A', 'B');
    process.env.NTFY_URL = 'https://ntfy.test';
    haal.mockImplementation(async () => new Response('', { status: 500 }));
    await expect(meldStoring('A', 'B')).resolves.toBeUndefined();
    await wijzigNtfyOnderwerp(beheerder, '');
    haal.mockClear();
    await meldStoring('A', 'B');
    expect(haal).not.toHaveBeenCalled();
  });
});
