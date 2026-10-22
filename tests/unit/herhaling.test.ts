import { describe, expect, it } from 'vitest';
import { datumsVoorHerhaling, type HerhalingRegel } from '@/lib/domein/herhaling';

const WERKWEEK = [1, 2, 3, 4, 5];
const ALLE_DAGEN = [1, 2, 3, 4, 5, 6, 7];
const regel = (r: Partial<HerhalingRegel> & Pick<HerhalingRegel, 'type' | 'startdatum'>): HerhalingRegel => ({
  weekdagen: [],
  intervalWeken: 1,
  ...r,
});

describe('datumsVoorHerhaling', () => {
  it('dagelijks: alleen werkdagen, vanaf de startdatum', () => {
    expect(datumsVoorHerhaling(regel({ type: 'dagelijks', startdatum: '2026-10-21' }), '2026-10-19', '2026-10-25', WERKWEEK))
      .toEqual(['2026-10-21', '2026-10-22', '2026-10-23']);
  });

  it('weekdagen: op de gekozen dagen', () => {
    expect(datumsVoorHerhaling(regel({ type: 'weekdagen', weekdagen: [1, 4], startdatum: '2026-10-19' }), '2026-10-19', '2026-11-01', WERKWEEK))
      .toEqual(['2026-10-19', '2026-10-22', '2026-10-26', '2026-10-29']);
  });

  it('wekelijks: op zaterdag gestart schuift naar maandag', () => {
    expect(datumsVoorHerhaling(regel({ type: 'wekelijks', startdatum: '2026-10-24' }), '2026-10-19', '2026-11-08', WERKWEEK))
      .toEqual(['2026-10-26', '2026-11-02']);
  });

  it('elke 2 weken: om de week overslaan', () => {
    expect(datumsVoorHerhaling(regel({ type: 'elke_x_weken', intervalWeken: 2, startdatum: '2026-10-19' }), '2026-10-19', '2026-11-30', WERKWEEK))
      .toEqual(['2026-10-19', '2026-11-02', '2026-11-16', '2026-11-30']);
  });

  it('maandelijks: korte maanden krijgen de laatste dag', () => {
    expect(datumsVoorHerhaling(regel({ type: 'maandelijks', startdatum: '2026-01-31' }), '2026-01-01', '2026-04-30', ALLE_DAGEN))
      .toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('maandelijks: weekend schuift naar de eerste werkdag', () => {
    expect(datumsVoorHerhaling(regel({ type: 'maandelijks', startdatum: '2026-01-31' }), '2026-01-01', '2026-03-31', WERKWEEK))
      .toEqual(['2026-02-02', '2026-03-02', '2026-03-31']);
  });

  it('een verschoven datum die in het venster valt telt mee, eentje ervoor niet', () => {
    // basis za 24 okt → ma 26 okt; venster begint op 25 okt
    expect(datumsVoorHerhaling(regel({ type: 'wekelijks', startdatum: '2026-10-24' }), '2026-10-25', '2026-10-30', WERKWEEK))
      .toEqual(['2026-10-26']);
  });

  it('geeft niets als de startdatum na het venster ligt of het venster leeg is', () => {
    expect(datumsVoorHerhaling(regel({ type: 'dagelijks', startdatum: '2026-12-01' }), '2026-10-19', '2026-10-25', WERKWEEK)).toEqual([]);
    expect(datumsVoorHerhaling(regel({ type: 'dagelijks', startdatum: '2026-10-01' }), '2026-10-25', '2026-10-19', WERKWEEK)).toEqual([]);
  });
});
