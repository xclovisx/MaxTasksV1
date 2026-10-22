import { describe, expect, it } from 'vitest';
import {
  eersteWerkdagVanaf, isoWeek, kortDatumLabel, laatsteDagVanMaand, maandagVan, parseWeekCode,
  plusDagen, vandaagInAmsterdam, verschilInDagen, weekCode, weekdag,
} from '@/lib/domein/datums';

const WERKWEEK = [1, 2, 3, 4, 5];

describe('datums', () => {
  it('telt dagen op over maand- en jaargrenzen', () => {
    expect(plusDagen('2026-10-31', 1)).toBe('2026-11-01');
    expect(plusDagen('2026-12-31', 1)).toBe('2027-01-01');
    expect(plusDagen('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('geeft de weekdag met 1=ma en 7=zo', () => {
    expect(weekdag('2026-10-19')).toBe(1);
    expect(weekdag('2026-10-22')).toBe(4);
    expect(weekdag('2026-10-25')).toBe(7);
  });

  it('berekent het verschil in dagen (tot − van)', () => {
    expect(verschilInDagen('2026-10-19', '2026-10-22')).toBe(3);
    expect(verschilInDagen('2026-10-22', '2026-10-19')).toBe(-3);
    expect(verschilInDagen('2026-03-28', '2026-03-30')).toBe(2);
  });

  it('vindt de maandag van een week', () => {
    expect(maandagVan('2026-10-22')).toBe('2026-10-19');
    expect(maandagVan('2026-10-25')).toBe('2026-10-19');
    expect(maandagVan('2026-10-19')).toBe('2026-10-19');
  });

  it('vindt de eerste werkdag op of na een datum', () => {
    expect(eersteWerkdagVanaf('2026-10-24', WERKWEEK)).toBe('2026-10-26');
    expect(eersteWerkdagVanaf('2026-10-22', WERKWEEK)).toBe('2026-10-22');
    expect(eersteWerkdagVanaf('2026-10-24', [1, 2, 3, 4, 5, 6])).toBe('2026-10-24');
    expect(() => eersteWerkdagVanaf('2026-10-24', [])).toThrow();
  });

  it('bepaalt vandaag in Amsterdam, ook rond middernacht', () => {
    expect(vandaagInAmsterdam(new Date('2026-10-21T22:30:00Z'))).toBe('2026-10-22');
    expect(vandaagInAmsterdam(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
    expect(vandaagInAmsterdam(new Date('2026-10-22T10:00:00Z'))).toBe('2026-10-22');
  });

  it('rekent ISO-weken uit en terug', () => {
    expect(isoWeek('2026-10-22')).toEqual({ jaar: 2026, week: 43 });
    expect(isoWeek('2027-01-01')).toEqual({ jaar: 2026, week: 53 });
    expect(weekCode('2026-10-22')).toBe('2026-W43');
    expect(parseWeekCode('2026-W43')).toBe('2026-10-19');
    expect(parseWeekCode('2026-W01')).toBe('2025-12-29');
    expect(parseWeekCode('onzin')).toBeNull();
    expect(parseWeekCode('2026-W54')).toBeNull();
  });

  it('kent de laatste dag van de maand', () => {
    expect(laatsteDagVanMaand(2026, 2)).toBe(28);
    expect(laatsteDagVanMaand(2028, 2)).toBe(29);
    expect(laatsteDagVanMaand(2026, 4)).toBe(30);
  });

  it('maakt een kort datumlabel', () => {
    expect(kortDatumLabel('2026-10-22')).toBe('22 okt');
    expect(kortDatumLabel('2026-03-01')).toBe('1 mrt');
  });
});
