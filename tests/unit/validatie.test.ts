import { describe, expect, it } from 'vitest';
import { instellingenSchema, herhalingSchema, isUuid, medewerkerSchema, nieuweTaakSchema } from '@/lib/domein/validatie';

describe('validatie', () => {
  const basis = { bordId: '7f1c0c8e-2f3a-4b8e-9f00-3d2c1b0a9e8f', titel: '  Banden ophalen ', datum: '2026-10-22', tijd: null, prioriteit: 'middel', herhaling: null };

  it('accepteert een geldige taak en trimt de titel', () => {
    const v = nieuweTaakSchema.parse(basis);
    expect(v.titel).toBe('Banden ophalen');
    expect(v.omschrijving).toBe('');
  });

  it('weigert lege titel, ongeldige datum, tijd en prioriteit', () => {
    expect(nieuweTaakSchema.safeParse({ ...basis, titel: ' ' }).success).toBe(false);
    expect(nieuweTaakSchema.safeParse({ ...basis, datum: '22-10-2026' }).success).toBe(false);
    expect(nieuweTaakSchema.safeParse({ ...basis, tijd: '25:00' }).success).toBe(false);
    expect(nieuweTaakSchema.safeParse({ ...basis, prioriteit: 'heel hoog' }).success).toBe(false);
  });

  it('eist weekdagen bij type weekdagen en minstens 2 weken bij elke_x_weken', () => {
    expect(herhalingSchema.safeParse({ type: 'weekdagen', weekdagen: [] }).success).toBe(false);
    expect(herhalingSchema.safeParse({ type: 'weekdagen', weekdagen: [1, 4] }).success).toBe(true);
    expect(herhalingSchema.safeParse({ type: 'elke_x_weken', intervalWeken: 1 }).success).toBe(false);
    expect(herhalingSchema.safeParse({ type: 'elke_x_weken', intervalWeken: 2 }).success).toBe(true);
  });

  it('valideert instellingen en medewerkers', () => {
    expect(instellingenSchema.safeParse({ naam: 'Garage', garageAdres: '', werkdagen: [] }).success).toBe(false);
    expect(instellingenSchema.parse({ naam: 'Garage', garageAdres: '', werkdagen: [1, 2] }).garageAdres).toBeNull();
    expect(medewerkerSchema.parse({ naam: 'Piet', gebruikersnaam: ' Piet.V ' }).gebruikersnaam).toBe('piet.v');
    expect(medewerkerSchema.safeParse({ naam: 'Piet', gebruikersnaam: 'piet de v' }).success).toBe(false);
  });

  it('herkent uuids', () => {
    expect(isUuid(basis.bordId)).toBe(true);
    expect(isUuid('abc')).toBe(false);
  });
});
