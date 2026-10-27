import { mkdtemp, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SessieGebruiker } from '../../src/lib/auth/sessies';
import { maakTaak } from '../../src/lib/diensten/taken';
import { verwerkCode, verwerkDownload, verwerkUpload, zelfdeHerkomst } from '../../src/lib/web/bijlagen-http';
import { codePng } from '../codes-helper';
import { leegDatabase, maakBord, maakMedewerkerCtx } from './helpers';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const APP = 'http://test.local';

let map: string;
let piet: SessieGebruiker;
let taakId: string;

function uploadVerzoek(bestand: File | null, headers: Record<string, string> = { origin: APP }): Request {
  const fd = new FormData();
  if (bestand) fd.append('bestand', bestand);
  return new Request(`${APP}/api/taken/${taakId}/bijlagen`, { method: 'POST', body: fd, headers });
}

beforeEach(async () => {
  await leegDatabase();
  map = await mkdtemp(path.join(tmpdir(), 'takenbord-http-'));
  process.env.BIJLAGEN_MAP = map;
  const ctx = await maakMedewerkerCtx('piet', 'Piet');
  piet = { id: ctx.gebruikerId, naam: 'Piet', gebruikersnaam: 'piet', rol: 'medewerker' };
  ({ id: taakId } = await maakTaak(ctx, {
    bordId: await maakBord(), herhaling: null, titel: 'Pakket', omschrijving: '', datum: '2026-10-27', tijd: null, prioriteit: 'middel',
  }));
});

afterEach(async () => {
  delete process.env.BIJLAGEN_MAP;
  await rm(map, { recursive: true, force: true });
});

describe('zelfdeHerkomst', () => {
  it('vergelijkt de Origin met APP_URL', () => {
    const r = (origin?: string) => new Request(APP, { method: 'POST', headers: origin ? { origin } : {} });
    expect(zelfdeHerkomst(r(APP), APP)).toBe(true);
    expect(zelfdeHerkomst(r(`${APP}/`), `${APP}/`)).toBe(true);
    expect(zelfdeHerkomst(r('https://kwaad.example'), APP)).toBe(false);
    expect(zelfdeHerkomst(r(), APP)).toBe(false);
    expect(zelfdeHerkomst(r(APP), undefined)).toBe(false);
  });
});

describe('upload', () => {
  it('slaat een bestand op en geeft 201 met de bijlage', async () => {
    const res = await verwerkUpload(uploadVerzoek(new File([PNG], 'qr.png', { type: 'image/png' })), piet, taakId, APP);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: expect.any(String), naam: 'qr.png', type: 'image/png', grootte: PNG.length, code: null });
  });

  it('weigert zonder sessie, met een verkeerde Origin, zonder bestand of als te groot', async () => {
    const f = () => new File([PNG], 'qr.png');
    expect((await verwerkUpload(uploadVerzoek(f()), null, taakId, APP)).status).toBe(401);
    expect((await verwerkUpload(uploadVerzoek(f(), { origin: 'https://kwaad.example' }), piet, taakId, APP)).status).toBe(403);
    expect((await verwerkUpload(uploadVerzoek(null), piet, taakId, APP)).status).toBe(400);
    const groot = await verwerkUpload(uploadVerzoek(f(), { origin: APP, 'content-length': String(20 * 1024 * 1024) }), piet, taakId, APP);
    expect(groot.status).toBe(413);
    expect(await groot.json()).toEqual({ fout: 'Te groot (max 10 MB).' });
  });

  it('kapt een groot verzoek zonder Content-Length af zonder alles te lezen', async () => {
    const chunk = new Uint8Array(64 * 1024);
    const totaal = 400; // 25 MB, ruim boven 10 MB + marge
    let gelezen = 0;
    const stroom = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (gelezen >= totaal) return controller.close();
        gelezen++;
        controller.enqueue(chunk);
      },
    });
    const verzoek = new Request(`${APP}/api/taken/${taakId}/bijlagen`, {
      method: 'POST', body: stroom, duplex: 'half',
      headers: { origin: APP, 'content-type': 'multipart/form-data; boundary=xyz' },
    } as RequestInit);
    expect(verzoek.headers.get('content-length')).toBeNull();
    const res = await verwerkUpload(verzoek, piet, taakId, APP);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ fout: 'Te groot (max 10 MB).' });
    expect(gelezen).toBeLessThan(totaal);
  });

  it('vertaalt dienstfouten naar statuscodes', async () => {
    const gif = await verwerkUpload(uploadVerzoek(new File(['GIF89a'], 'x.gif')), piet, taakId, APP);
    expect(gif.status).toBe(400);
    expect(await gif.json()).toEqual({ fout: "Dit bestandstype kan niet (alleen foto's en PDF's)." });
    const onbekend = await verwerkUpload(uploadVerzoek(new File([PNG], 'qr.png')), piet, '00000000-0000-4000-8000-000000000000', APP);
    expect(onbekend.status).toBe(404);
    process.env.OPSLAG_CONTROLE = '1';
    try {
      expect((await verwerkUpload(uploadVerzoek(new File([PNG], 'qr.png')), piet, taakId, APP)).status).toBe(503);
    } finally {
      delete process.env.OPSLAG_CONTROLE;
    }
  });
});

describe('download', () => {
  it('streamt het bestand met veilige headers', async () => {
    const up = await (await verwerkUpload(uploadVerzoek(new File([PNG], 'qr pakket.png')), piet, taakId, APP)).json();
    const res = await verwerkDownload(piet, up.id);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('content-disposition')).toBe("inline; filename*=UTF-8''qr%20pakket.png");
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('cache-control')).toBe('private, max-age=3600');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);
  });

  it('401 zonder sessie, 404 bij onbekend of ontbrekend bestand', async () => {
    const up = await (await verwerkUpload(uploadVerzoek(new File([PNG], 'qr.png')), piet, taakId, APP)).json();
    expect((await verwerkDownload(null, up.id)).status).toBe(401);
    expect((await verwerkDownload(piet, 'onzin')).status).toBe(404);
    await unlink(path.join(map, up.id));
    expect((await verwerkDownload(piet, up.id)).status).toBe(404);
  });
});

describe('code', () => {
  it('geeft de nagemaakte code als SVG met veilige headers', async () => {
    const up = await (await verwerkUpload(uploadVerzoek(new File([await codePng('QRCode', 'OPHAAL-42')], 'qr.png')), piet, taakId, APP)).json();
    expect(up.code).toEqual({ formaat: 'QRCode', tekst: 'OPHAAL-42' });
    const res = await verwerkCode(piet, up.id);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/svg+xml');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-security-policy')).toBe("default-src 'none'; style-src 'unsafe-inline'");
    expect(res.headers.get('cache-control')).toBe('private, max-age=3600');
    expect(await res.text()).toMatch(/<svg[^>]*viewBox/);
  });

  it('401 zonder sessie, 404 zonder code of bij een onbekende bijlage', async () => {
    const up = await (await verwerkUpload(uploadVerzoek(new File([PNG], 'gewoon.png')), piet, taakId, APP)).json();
    expect((await verwerkCode(null, up.id)).status).toBe(401);
    expect((await verwerkCode(piet, up.id)).status).toBe(404);
    expect((await verwerkCode(piet, 'onzin')).status).toBe(404);
  });
});
