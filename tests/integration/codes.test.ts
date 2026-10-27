import { describe, expect, it } from 'vitest';
import { herkenCode, tekenCode } from '../../src/lib/codes';
import { codePng } from '../codes-helper';

describe('codes', () => {
  it('herkent een QR-code en een streepjescode uit een PNG', async () => {
    expect(await herkenCode(await codePng('QRCode', 'https://postnl.nl/ophalen?c=3SABC123'))).toEqual({
      formaat: 'QRCode', tekst: 'https://postnl.nl/ophalen?c=3SABC123',
    });
    expect(await herkenCode(await codePng('Code128', '3SPNL1234567'))).toEqual({ formaat: 'Code128', tekst: '3SPNL1234567' });
  });

  it('geeft null voor een plaatje zonder code of kapotte invoer, en gooit nooit', async () => {
    expect(await herkenCode(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]))).toBeNull();
    expect(await herkenCode(new Uint8Array())).toBeNull();
  });

  it('herkent ook een grote QR-code', async () => {
    expect(await herkenCode(await codePng('QRCode', 'groot', 10))).toEqual({ formaat: 'QRCode', tekst: 'groot' });
  });

  it('tekent een schaalbare SVG zonder script of tekst', async () => {
    const svg = await tekenCode({ formaat: 'QRCode', tekst: 'é ü <script>' });
    expect(svg).toMatch(/<svg[^>]* viewBox="0 0 \d+ \d+"/);
    expect(svg).not.toMatch(/<script|<text/i);
    const streep = await tekenCode({ formaat: 'EAN13', tekst: '8712345678906' });
    expect(streep).toMatch(/viewBox/);
    await expect(tekenCode({ formaat: 'EAN13', tekst: 'abc' })).rejects.toThrow();
  });
});
