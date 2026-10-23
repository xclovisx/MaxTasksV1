import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Context } from '../../src/lib/context';
import { wijzigInstellingen } from '../../src/lib/diensten/instellingen';
import { MELDING_GEEN_GARAGE, MELDING_GEEN_LOCATIE, planRoute } from '../../src/lib/diensten/route';
import { maakTaak } from '../../src/lib/diensten/taken';
import { Ongeldig } from '../../src/lib/fouten';
import { leegDatabase, maakBeheerderCtx, maakBord, maakMedewerkerCtx } from './helpers';

let beheerder: Context;
let piet: Context;
let bordId: string;
let taakId: string;

const stop = (naam: string, lat: number, lng: number) =>
  ({ naam, adres: `${naam}-straat 1`, lat, lng, googlePlaceId: null, locatieId: null, bewaar: false });
const START = { lat: 51.6, lng: 4.8 };

const googleAntwoord = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;

const geoptimaliseerd = {
  routes: [{
    duration: '2400s',
    distanceMeters: 31000,
    optimizedIntermediateWaypointIndex: [2, 0, 1],
    legs: [
      { duration: '600s', distanceMeters: 8000 },
      { duration: '300s', distanceMeters: 4000 },
      { duration: '700s', distanceMeters: 9000 },
      { duration: '800s', distanceMeters: 10000 },
    ],
  }],
};

const verzondenBody = (haal: ReturnType<typeof vi.fn>) => JSON.parse(String((haal.mock.calls[0] as [string, RequestInit])[1].body));

async function zetGarage() {
  await wijzigInstellingen(beheerder, {
    naam: 'Garage Jansen', garageAdres: 'Dorpsstraat 1', garageLat: 51.55, garageLng: 4.7, werkdagen: [1, 2, 3, 4, 5],
  });
}

async function maakRonde(stops: ReturnType<typeof stop>[]) {
  return (await maakTaak(piet, {
    bordId, herhaling: null, titel: 'Ochtendronde', omschrijving: '', datum: '2026-11-02', tijd: null, prioriteit: 'middel', stops,
  })).id;
}

beforeEach(async () => {
  await leegDatabase();
  process.env.GOOGLE_MAPS_API_KEY = 'test-sleutel';
  beheerder = await maakBeheerderCtx();
  piet = await maakMedewerkerCtx('piet', 'Piet');
  bordId = await maakBord();
  taakId = await maakRonde([stop('A', 51.51, 4.71), stop('B', 51.52, 4.72), stop('C', 51.53, 4.73)]);
});

afterEach(() => { delete process.env.GOOGLE_MAPS_API_KEY; });

describe('route plannen', () => {
  it('berekent de snelste volgorde van de huidige locatie naar de garage', async () => {
    await zetGarage();
    const haal = googleAntwoord(geoptimaliseerd);
    expect(await planRoute(taakId, START, haal)).toEqual({
      volgorde: [2, 0, 1],
      geoptimaliseerd: true,
      meldingen: [],
      delen: [
        { naar: 'C', duurSec: 600, meters: 8000 },
        { naar: 'A', duurSec: 300, meters: 4000 },
        { naar: 'B', duurSec: 700, meters: 9000 },
        { naar: 'Garage Jansen', duurSec: 800, meters: 10000 },
      ],
      totaalSec: 2400,
      totaalMeters: 31000,
      url: 'https://www.google.com/maps/dir/?api=1&origin=51.6%2C4.8&destination=51.55%2C4.7&waypoints=51.53%2C4.73%7C51.51%2C4.71%7C51.52%2C4.72&travelmode=driving',
    });
    const body = verzondenBody(haal);
    expect(body.origin).toEqual({ location: { latLng: { latitude: 51.6, longitude: 4.8 } } });
    expect(body.destination).toEqual({ location: { latLng: { latitude: 51.55, longitude: 4.7 } } });
    expect(body.intermediates).toHaveLength(3);
  });

  it('zonder huidige locatie start de route bij de garage', async () => {
    await zetGarage();
    const haal = googleAntwoord(geoptimaliseerd);
    const plan = await planRoute(taakId, null, haal);
    expect(plan.meldingen).toEqual([MELDING_GEEN_LOCATIE]);
    expect(plan.url).toContain('origin=51.55%2C4.7&destination=51.55%2C4.7');
    expect(verzondenBody(haal).origin).toEqual({ location: { latLng: { latitude: 51.55, longitude: 4.7 } } });
  });

  it('faalt Google, dan de ingevoerde volgorde met een melding', async () => {
    await zetGarage();
    expect(await planRoute(taakId, START, googleAntwoord({}, 500))).toEqual({
      volgorde: [0, 1, 2],
      geoptimaliseerd: false,
      meldingen: ['Volgorde kon niet berekend worden'],
      delen: null,
      totaalSec: null,
      totaalMeters: null,
      url: 'https://www.google.com/maps/dir/?api=1&origin=51.6%2C4.8&destination=51.55%2C4.7&waypoints=51.51%2C4.71%7C51.52%2C4.72%7C51.53%2C4.73&travelmode=driving',
    });
  });

  it('zonder garage-adres: geen berekening, de rit eindigt bij de laatste stop', async () => {
    const haal = googleAntwoord(geoptimaliseerd);
    const plan = await planRoute(taakId, START, haal);
    expect(haal).not.toHaveBeenCalled();
    expect(plan.geoptimaliseerd).toBe(false);
    expect(plan.meldingen).toEqual([MELDING_GEEN_GARAGE]);
    expect(plan.url).toBe('https://www.google.com/maps/dir/?api=1&origin=51.6%2C4.8&destination=51.53%2C4.73&waypoints=51.51%2C4.71%7C51.52%2C4.72&travelmode=driving');
  });

  it('weigert een taak met minder dan 2 stops en een ongeldig startpunt', async () => {
    await zetGarage();
    const eenStop = await maakRonde([stop('A', 51.51, 4.71)]);
    await expect(planRoute(eenStop, START, googleAntwoord(geoptimaliseerd))).rejects.toBeInstanceOf(Ongeldig);
    await expect(planRoute(taakId, { lat: 200, lng: 4.8 }, googleAntwoord(geoptimaliseerd))).rejects.toThrow();
  });
});
