import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { berekenRoute, RouteNietBeschikbaar } from '@/lib/google/routes';

const antwoord = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;

const invoer = {
  start: { lat: 51.6, lng: 4.8 },
  bestemming: { lat: 51.55, lng: 4.7 },
  stops: [{ lat: 51.51, lng: 4.71 }, { lat: 51.52, lng: 4.72 }],
};

const goed = {
  routes: [{
    duration: '1500s',
    distanceMeters: 20000,
    optimizedIntermediateWaypointIndex: [1, 0],
    legs: [{ duration: '400s', distanceMeters: 6000 }, { duration: '500.4s' }, { duration: '600s', distanceMeters: 14000 }],
  }],
};

describe('Google Routes-client', () => {
  beforeEach(() => { process.env.GOOGLE_MAPS_API_KEY = 'test-sleutel'; });
  afterEach(() => { delete process.env.GOOGLE_MAPS_API_KEY; });

  it('zonder sleutel: niet beschikbaar, zonder Google aan te roepen', async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    const haal = antwoord(goed);
    await expect(berekenRoute(invoer, haal)).rejects.toThrow('Volgorde kon niet berekend worden');
    expect(haal).not.toHaveBeenCalled();
  });

  it('stuurt de juiste aanvraag', async () => {
    const haal = antwoord(goed);
    await berekenRoute(invoer, haal);
    const [url, init] = haal.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://routes.googleapis.com/directions/v2:computeRoutes');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Goog-Api-Key']).toBe('test-sleutel');
    expect(headers['X-Goog-FieldMask']).toBe(
      'routes.duration,routes.distanceMeters,routes.legs.duration,routes.legs.distanceMeters,routes.optimizedIntermediateWaypointIndex',
    );
    expect(JSON.parse(String(init.body))).toEqual({
      origin: { location: { latLng: { latitude: 51.6, longitude: 4.8 } } },
      destination: { location: { latLng: { latitude: 51.55, longitude: 4.7 } } },
      intermediates: [
        { location: { latLng: { latitude: 51.51, longitude: 4.71 } } },
        { location: { latLng: { latitude: 51.52, longitude: 4.72 } } },
      ],
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
      optimizeWaypointOrder: true,
      languageCode: 'nl-NL',
      units: 'METRIC',
    });
  });

  it('vertaalt volgorde, reistijden en afstanden', async () => {
    expect(await berekenRoute(invoer, antwoord(goed))).toEqual({
      volgorde: [1, 0],
      delen: [{ duurSec: 400, meters: 6000 }, { duurSec: 500, meters: 0 }, { duurSec: 600, meters: 14000 }],
      totaalSec: 1500,
      totaalMeters: 20000,
    });
  });

  it('foutstatus, netwerkfout of onleesbaar antwoord: niet beschikbaar', async () => {
    await expect(berekenRoute(invoer, antwoord({}, 429))).rejects.toBeInstanceOf(RouteNietBeschikbaar);
    const kapot = vi.fn(async () => { throw new Error('netwerk'); }) as unknown as typeof fetch;
    await expect(berekenRoute(invoer, kapot)).rejects.toBeInstanceOf(RouteNietBeschikbaar);
    const html = vi.fn(async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch;
    await expect(berekenRoute(invoer, html)).rejects.toBeInstanceOf(RouteNietBeschikbaar);
  });

  it('weigert een onvolledig of onlogisch antwoord', async () => {
    const r = goed.routes[0];
    for (const kapot of [
      {},
      { routes: [] },
      { routes: [{ ...r, optimizedIntermediateWaypointIndex: [0, 0] }] },
      { routes: [{ ...r, optimizedIntermediateWaypointIndex: [-1] }] },
      { routes: [{ ...r, legs: r.legs.slice(1) }] },
      { routes: [{ ...r, legs: [null, r.legs[1], r.legs[2]] }] },
      { routes: [{ ...r, duration: 'lang' }] },
    ]) {
      await expect(berekenRoute(invoer, antwoord(kapot))).rejects.toBeInstanceOf(RouteNietBeschikbaar);
    }
  });
});
