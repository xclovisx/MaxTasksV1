import { describe, expect, it } from 'vitest';
import {
  type Afwezigheid, afwezigheidsDagen, afwezigheidWaarschuwing, balkTekst, herhalingTekst, periodeTekst, tijdvakLabel,
  vergelijkAfwezigheden,
} from '@/lib/domein/afwezigheid';
import { afwezigheidSchema } from '@/lib/domein/validatie';

const blok = (extra: Partial<Afwezigheid> = {}): Afwezigheid => ({
  id: 'b1', begindatum: '2026-11-02', einddatum: null, heleDag: true, van: null, tot: null, reden: null,
  herhalingType: null, weekdagen: [], intervalWeken: 1, ...extra,
});
const tandarts = blok({ heleDag: false, van: '13:00', tot: '15:00', reden: 'tandarts' });

describe('afwezigheidsdagen', () => {
  it('eenmalig: alleen de begindatum, binnen de periode', () => {
    expect(afwezigheidsDagen(blok(), '2026-11-02', '2026-11-08')).toEqual(['2026-11-02']);
    expect(afwezigheidsDagen(blok(), '2026-11-03', '2026-11-08')).toEqual([]);
  });

  it('een periode zonder herhaling, afgekapt op de gevraagde week', () => {
    expect(afwezigheidsDagen(blok({ begindatum: '2026-10-30', einddatum: '2026-11-04' }), '2026-11-02', '2026-11-08'))
      .toEqual(['2026-11-02', '2026-11-03', '2026-11-04']);
  });

  it('wekelijks op zaterdag schuift niet door naar maandag', () => {
    expect(afwezigheidsDagen(blok({ begindatum: '2026-10-31', herhalingType: 'wekelijks' }), '2026-11-02', '2026-11-15'))
      .toEqual(['2026-11-07', '2026-11-14']);
  });

  it('gekozen weekdagen tot en met de einddatum', () => {
    const woensdag = blok({ begindatum: '2026-11-02', einddatum: '2026-11-11', herhalingType: 'weekdagen', weekdagen: [3] });
    expect(afwezigheidsDagen(woensdag, '2026-11-01', '2026-11-30')).toEqual(['2026-11-04', '2026-11-11']);
  });

  it('dagelijks is echt elke dag', () => {
    expect(afwezigheidsDagen(blok({ begindatum: '2026-11-06', herhalingType: 'dagelijks' }), '2026-11-06', '2026-11-09'))
      .toEqual(['2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09']);
  });

  it('elke 2 weken vanaf de begindatum', () => {
    const tweewekelijks = blok({ begindatum: '2026-11-02', herhalingType: 'elke_x_weken', intervalWeken: 2 });
    expect(afwezigheidsDagen(tweewekelijks, '2026-11-01', '2026-11-30')).toEqual(['2026-11-02', '2026-11-16', '2026-11-30']);
  });
});

describe('teksten', () => {
  it('tijdvak, balk en volgorde', () => {
    expect(tijdvakLabel(blok())).toBe('hele dag');
    expect(tijdvakLabel(tandarts)).toBe('13:00–15:00');
    expect(balkTekst('Max', blok({ reden: 'vrij' }))).toBe('Max niet beschikbaar (hele dag) · vrij');
    expect(balkTekst('Max', blok())).toBe('Max niet beschikbaar (hele dag)');
    expect(balkTekst('Max', tandarts)).toBe('Max niet beschikbaar · 13:00–15:00 · tandarts');
    const ochtend = blok({ id: 'b2', heleDag: false, van: '09:00', tot: '10:00' });
    expect([tandarts, ochtend, blok({ id: 'b3' })].sort(vergelijkAfwezigheden).map((b) => b.id)).toEqual(['b3', 'b2', 'b1']);
  });

  it('periode en herhaling voor de lijst', () => {
    expect(periodeTekst(blok())).toBe('ma 2 nov');
    expect(periodeTekst(blok({ begindatum: '2026-10-30', einddatum: '2026-11-04' }))).toBe('vr 30 okt t/m wo 4 nov');
    expect(periodeTekst(blok({ begindatum: '2026-10-31', herhalingType: 'wekelijks' }))).toBe('vanaf za 31 okt');
    expect(periodeTekst(blok({ begindatum: '2026-10-31', einddatum: '2026-11-14', herhalingType: 'wekelijks' }))).toBe('vanaf za 31 okt t/m za 14 nov');
    expect(herhalingTekst(blok())).toBe('Eenmalig');
    expect(herhalingTekst(blok({ herhalingType: 'dagelijks' }))).toBe('Elke dag');
    expect(herhalingTekst(blok({ herhalingType: 'wekelijks' }))).toBe('Wekelijks');
    expect(herhalingTekst(blok({ herhalingType: 'weekdagen', weekdagen: [1, 3] }))).toBe('Op ma, wo');
    expect(herhalingTekst(blok({ herhalingType: 'elke_x_weken', intervalWeken: 3 }))).toBe('Elke 3 weken');
  });

  it('waarschuwt bij een hele dag of een tijd binnen een tijdvak', () => {
    expect(afwezigheidWaarschuwing('Max', [blok({ reden: 'vrij' })], null)).toBe('Max is dan niet beschikbaar (vrij).');
    expect(afwezigheidWaarschuwing('Max', [tandarts], '14:00')).toBe('Max is dan niet beschikbaar (tandarts).');
    expect(afwezigheidWaarschuwing('Max', [tandarts], '13:00')).toBe('Max is dan niet beschikbaar (tandarts).');
    expect(afwezigheidWaarschuwing('Max', [blok({ heleDag: false, van: '13:00', tot: '15:00' })], '14:00')).toBe('Max is dan niet beschikbaar.');
  });

  it('geen waarschuwing buiten het tijdvak; zonder tijd een let-op met alle tijdvakken', () => {
    expect(afwezigheidWaarschuwing('Max', [tandarts], '15:00')).toBeNull();
    expect(afwezigheidWaarschuwing('Max', [], null)).toBeNull();
    const ochtend = blok({ id: 'b2', heleDag: false, van: '09:00', tot: '10:00' });
    expect(afwezigheidWaarschuwing('Max', [tandarts, ochtend], null))
      .toBe('Let op: Max is die dag van 09:00 tot 10:00 en van 13:00 tot 15:00 niet beschikbaar.');
  });
});

describe('afwezigheidSchema', () => {
  it('wist het tijdvak bij een hele dag en maakt een lege reden null', () => {
    expect(afwezigheidSchema.parse({ begindatum: '2026-11-02', heleDag: true, van: '09:00', tot: '10:00', reden: '  ' }))
      .toEqual({ begindatum: '2026-11-02', einddatum: null, heleDag: true, van: null, tot: null, reden: null, herhaling: null });
  });

  it('weigert een einddatum vóór de begindatum en een omgekeerd of ontbrekend tijdvak', () => {
    expect(() => afwezigheidSchema.parse({ begindatum: '2026-11-02', einddatum: '2026-11-01', heleDag: true }))
      .toThrow('De einddatum ligt vóór de begindatum');
    expect(() => afwezigheidSchema.parse({ begindatum: '2026-11-02', heleDag: false, van: '15:00', tot: '13:00' }))
      .toThrow('Kies een tijdvak');
    expect(() => afwezigheidSchema.parse({ begindatum: '2026-11-02', heleDag: false })).toThrow('Kies een tijdvak');
    expect(() => afwezigheidSchema.parse({ begindatum: '2026-11-02', heleDag: true, reden: 'x'.repeat(101) }))
      .toThrow('Reden is te lang');
  });

  it('controleert de herhaling zoals bij taken', () => {
    expect(() => afwezigheidSchema.parse({ begindatum: '2026-11-02', heleDag: true, herhaling: { type: 'weekdagen', weekdagen: [] } }))
      .toThrow('Kies minstens één weekdag');
  });
});
