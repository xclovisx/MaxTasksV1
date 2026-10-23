import { describe, expect, it } from 'vitest';
import { isUrgentVerhoogd, urgentBericht } from '@/lib/domein/meldingen';

describe('meldingen', () => {
  it('meldt nieuwe en verhoogde zsm/nu-taken', () => {
    expect(isUrgentVerhoogd(null, 'nu')).toBe(true);
    expect(isUrgentVerhoogd(null, 'zsm')).toBe(true);
    expect(isUrgentVerhoogd(null, 'hoog')).toBe(false);
    expect(isUrgentVerhoogd('middel', 'zsm')).toBe(true);
    expect(isUrgentVerhoogd('zsm', 'nu')).toBe(true);
    expect(isUrgentVerhoogd('nu', 'zsm')).toBe(false);
    expect(isUrgentVerhoogd('nu', 'nu')).toBe(false);
    expect(isUrgentVerhoogd('laag', 'hoog')).toBe(false);
  });

  it('maakt het bericht met een link naar Vandaag op die dag', () => {
    expect(urgentBericht({ titel: 'Klant wacht', prioriteit: 'nu', bordNaam: 'Werkplaats', datum: '2026-11-02', tijd: '09:30' }, 'https://bord.test/'))
      .toEqual({
        titel: 'Nu: Klant wacht', tekst: 'Werkplaats · maandag 2 nov om 09:30', prioriteit: 5,
        tags: ['rotating_light'], link: 'https://bord.test/vandaag?datum=2026-11-02',
      });
    expect(urgentBericht({ titel: 'Onderdeel halen', prioriteit: 'zsm', bordNaam: 'Werkplaats', datum: '2026-11-03', tijd: null }, 'https://bord.test'))
      .toEqual({
        titel: 'Zo snel mogelijk: Onderdeel halen', tekst: 'Werkplaats · dinsdag 3 nov', prioriteit: 4,
        tags: ['warning'], link: 'https://bord.test/vandaag?datum=2026-11-03',
      });
  });
});
