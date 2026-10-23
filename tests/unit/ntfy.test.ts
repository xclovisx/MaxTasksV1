import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NtfyMislukt, NtfyNietIngesteld, stuurNtfy } from '@/lib/meldingen/ntfy';

const bericht = {
  titel: 'Nu: Klant wacht', tekst: 'Werkplaats · maandag 2 nov', prioriteit: 5 as const,
  tags: ['rotating_light'], link: 'https://bord.test/vandaag?datum=2026-11-02',
};
const ok = () => vi.fn(async () => new Response('{}')) as unknown as typeof fetch & ReturnType<typeof vi.fn>;

describe('ntfy-client', () => {
  beforeEach(() => {
    process.env.NTFY_URL = 'https://ntfy.test/';
    delete process.env.NTFY_TOKEN;
  });
  afterEach(() => {
    delete process.env.NTFY_URL;
    delete process.env.NTFY_TOKEN;
  });

  it('zonder server: niet ingesteld, zonder iets te versturen', async () => {
    const haal = ok();
    delete process.env.NTFY_URL;
    await expect(stuurNtfy('garage-max', bericht, haal)).rejects.toBeInstanceOf(NtfyNietIngesteld);
    process.env.NTFY_URL = '  ';
    await expect(stuurNtfy('garage-max', bericht, haal)).rejects.toBeInstanceOf(NtfyNietIngesteld);
    expect(haal).not.toHaveBeenCalled();
  });

  it('publiceert als JSON op de server', async () => {
    const haal = ok();
    await stuurNtfy('garage-max', bericht, haal);
    const [url, init] = haal.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://ntfy.test');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(JSON.parse(String(init.body))).toEqual({
      topic: 'garage-max', title: 'Nu: Klant wacht', message: 'Werkplaats · maandag 2 nov', priority: 5,
      tags: ['rotating_light'], click: 'https://bord.test/vandaag?datum=2026-11-02',
    });
  });

  it('stuurt het token mee als dat er is', async () => {
    process.env.NTFY_TOKEN = 'tk_geheim';
    const haal = ok();
    await stuurNtfy('garage-max', bericht, haal);
    expect(((haal.mock.calls[0] as [string, RequestInit])[1].headers as Record<string, string>).Authorization).toBe('Bearer tk_geheim');
  });

  it('foutstatus of netwerkfout: mislukt', async () => {
    const geweigerd = vi.fn(async () => new Response('', { status: 403 })) as unknown as typeof fetch;
    await expect(stuurNtfy('garage-max', bericht, geweigerd)).rejects.toBeInstanceOf(NtfyMislukt);
    const kapot = vi.fn(async () => { throw new Error('netwerk'); }) as unknown as typeof fetch;
    await expect(stuurNtfy('garage-max', bericht, kapot)).rejects.toBeInstanceOf(NtfyMislukt);
  });
});
