import { describe, expect, it } from 'vitest';
import {
  alsJpgNaam, bepaalType, formatGrootte, geldigeCode, grootsteCode, isQr, magOngewijzigd, MAX_BIJLAGE_BYTES, plakNaam, schoonNaam,
  soortVerwerking,
} from '../../src/lib/domein/bijlagen';

const bytes = (...x: number[]) => new Uint8Array(x);
const tekst = (s: string) => new TextEncoder().encode(s);

describe('bepaalType', () => {
  it('herkent JPEG, PNG, WebP en PDF aan de eerste bytes', () => {
    expect(bepaalType(bytes(0xff, 0xd8, 0xff, 0xe0, 0))).toBe('image/jpeg');
    expect(bepaalType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe('image/png');
    expect(bepaalType(tekst('RIFF\x00\x00\x00\x00WEBPVP8 '))).toBe('image/webp');
    expect(bepaalType(tekst('%PDF-1.7\n'))).toBe('application/pdf');
  });

  it('weigert andere of te korte inhoud', () => {
    expect(bepaalType(tekst('GIF89a'))).toBeNull();
    expect(bepaalType(tekst('RIFF\x00\x00\x00\x00WAVE'))).toBeNull();
    expect(bepaalType(tekst('<html>'))).toBeNull();
    expect(bepaalType(bytes(0xff, 0xd8))).toBeNull();
    expect(bepaalType(bytes())).toBeNull();
  });
});

describe('namen', () => {
  it('schoonNaam haalt paden en stuurtekens weg en kort in', () => {
    expect(schoonNaam('C:\\fakepath\\qr-postnl.png')).toBe('qr-postnl.png');
    expect(schoonNaam('../../etc/passwd')).toBe('passwd');
    expect(schoonNaam(' a\u0000b\u001fc\u007f.pdf ')).toBe('abc.pdf');
    expect(schoonNaam('   ')).toBe('bijlage');
    expect(schoonNaam('x'.repeat(300))).toHaveLength(200);
  });

  it('schoonNaam knipt niet midden in een emoji', () => {
    const r = schoonNaam('x'.repeat(199) + '😀😀');
    expect([...r]).toHaveLength(200);
    expect(r.endsWith('😀')).toBe(true);
    expect(r.isWellFormed()).toBe(true);
  });

  it('alsJpgNaam vervangt de extensie', () => {
    expect(alsJpgNaam('IMG_1234.HEIC')).toBe('IMG_1234.jpg');
    expect(alsJpgNaam('foto.van.pakket.png')).toBe('foto.van.pakket.jpg');
    expect(alsJpgNaam('zonder-extensie')).toBe('zonder-extensie.jpg');
    expect(alsJpgNaam('.verborgen')).toBe('.verborgen.jpg');
  });

  it('plakNaam gebruikt de Nederlandse tijd en geen dubbele punt', () => {
    expect(plakNaam(new Date('2026-10-27T17:05:00Z'))).toBe('Schermafbeelding 27-10 18.05.jpg');
    expect(plakNaam(new Date('2026-07-01T06:30:00Z'))).toBe('Schermafbeelding 01-07 08.30.jpg');
  });
});

describe('verwerking in de browser', () => {
  it('verkleint foto’s, laat PDF’s ongewijzigd en weigert de rest', () => {
    expect(soortVerwerking('image/jpeg')).toBe('verklein');
    expect(soortVerwerking('image/heic')).toBe('verklein');
    expect(soortVerwerking('application/pdf')).toBe('ongewijzigd');
    expect(soortVerwerking('application/zip')).toBe('weiger');
    expect(soortVerwerking('')).toBe('weiger');
  });

  it('alleen JPEG, PNG en WebP mogen onverkleind als het verkleinen mislukt', () => {
    expect(magOngewijzigd('image/png')).toBe(true);
    expect(magOngewijzigd('image/webp')).toBe(true);
    expect(magOngewijzigd('image/heic')).toBe(false);
  });

  it('formatGrootte', () => {
    expect(formatGrootte(900)).toBe('900 B');
    expect(formatGrootte(340 * 1024)).toBe('340 kB');
    expect(formatGrootte(1.25 * 1024 * 1024)).toBe('1,3 MB');
    expect(MAX_BIJLAGE_BYTES).toBe(10 * 1024 * 1024);
  });
});

describe('codes', () => {
  const r = (over: Partial<{ format: string; text: string; isValid: boolean; contentType: string }> = {}) =>
    ({ format: 'QRCode', text: 'ABC', isValid: true, contentType: 'Text', ...over });

  it('geldigeCode accepteert alleen geldige tekst in een bekend formaat', () => {
    expect(geldigeCode(r())).toEqual({ formaat: 'QRCode', tekst: 'ABC' });
    expect(geldigeCode(r({ format: 'Code128', contentType: 'GS1' }))).toEqual({ formaat: 'Code128', tekst: 'ABC' });
    expect(geldigeCode(r({ isValid: false }))).toBeNull();
    expect(geldigeCode(r({ text: '' }))).toBeNull();
    expect(geldigeCode(r({ text: 'x'.repeat(2001) }))).toBeNull();
    expect(geldigeCode(r({ text: 'x'.repeat(2000) }))?.tekst).toHaveLength(2000);
    expect(geldigeCode(r({ contentType: 'Binary' }))).toBeNull();
    expect(geldigeCode(r({ format: 'DataMatrix' }))).toBeNull();
  });

  it('grootsteCode kiest het grootste oppervlak', () => {
    const vak = (b: number, h: number) => ({
      position: { topLeft: { x: 0, y: 0 }, topRight: { x: b, y: 0 }, bottomRight: { x: b, y: h }, bottomLeft: { x: 0, y: h } },
    });
    const klein = { naam: 'klein', ...vak(10, 10) };
    const groot = { naam: 'groot', ...vak(30, 20) };
    expect(grootsteCode([klein, groot])?.naam).toBe('groot');
    expect(grootsteCode([])).toBeNull();
  });

  it('isQr', () => {
    expect(isQr('QRCode')).toBe(true);
    expect(isQr('Code128')).toBe(false);
  });
});
