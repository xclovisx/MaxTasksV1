import { describe, expect, it } from 'vitest';
import { instellingenSchema, herhalingSchema, isUuid, MAX_STOPS, medewerkerSchema, nieuweTaakSchema, stopsSchema } from '@/lib/domein/validatie';

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

describe('stops en locaties', () => {
  const stop = { naam: 'Banden-Plus', adres: 'Industrieweg 12, Breda', lat: 51.589, lng: 4.776 };

  it('vult standaardwaarden aan en staat 0 tot 9 stops toe', () => {
    expect(stopsSchema.parse(undefined)).toEqual([]);
    expect(stopsSchema.parse([stop])).toEqual([{ ...stop, googlePlaceId: null, locatieId: null, bewaar: false }]);
    expect(stopsSchema.safeParse(Array(MAX_STOPS).fill(stop)).success).toBe(true);
  });

  it('weigert meer dan 9 stops en ongeldige coördinaten', () => {
    const r = stopsSchema.safeParse(Array(MAX_STOPS + 1).fill(stop));
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('Maximaal 9 locaties');
    expect(stopsSchema.safeParse([{ ...stop, lat: 91 }]).success).toBe(false);
    expect(stopsSchema.safeParse([{ ...stop, naam: ' ' }]).success).toBe(false);
  });

  it('nieuwe taak zonder stops krijgt een lege lijst', () => {
    const v = nieuweTaakSchema.parse({ bordId: '7f1c0c8e-2f3a-4b8e-9f00-3d2c1b0a9e8f', titel: 'X', datum: '2026-10-22', tijd: null, prioriteit: 'laag', herhaling: null });
    expect(v.stops).toEqual([]);
  });

  it('instellingen: coördinaten alleen samen met een adres', () => {
    expect(instellingenSchema.parse({ naam: 'G', garageAdres: 'Dorpsstraat 1', garageLat: 51.5, garageLng: 4.7, werkdagen: [1] }))
      .toMatchObject({ garageAdres: 'Dorpsstraat 1', garageLat: 51.5, garageLng: 4.7 });
    expect(instellingenSchema.parse({ naam: 'G', garageAdres: '', garageLat: 51.5, garageLng: 4.7, werkdagen: [1] }))
      .toMatchObject({ garageAdres: null, garageLat: null, garageLng: null });
  });
});
