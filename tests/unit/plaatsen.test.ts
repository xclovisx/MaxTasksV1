import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleNietBeschikbaar, plaatsDetails, zoekPlaatsen } from '@/lib/google/plaatsen';

const antwoord = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;

describe('Google Places-client', () => {
  beforeEach(() => { process.env.GOOGLE_MAPS_API_KEY = 'test-sleutel'; });
  afterEach(() => { delete process.env.GOOGLE_MAPS_API_KEY; });

  it('zonder sleutel: niet beschikbaar, zonder Google aan te roepen', async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    const haal = antwoord({});
    await expect(zoekPlaatsen('Dorpsstraat', 's1', haal)).rejects.toThrow('Adres zoeken tijdelijk niet beschikbaar');
    process.env.GOOGLE_MAPS_API_KEY = '';
    await expect(zoekPlaatsen('Dorpsstraat', 's1', haal)).rejects.toBeInstanceOf(GoogleNietBeschikbaar);
    expect(haal).not.toHaveBeenCalled();
  });

  it('plaatsDetails zonder sleutel: niet beschikbaar, zonder Google aan te roepen', async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    const haal = antwoord({});
    await expect(plaatsDetails('p1', 's1', haal)).rejects.toBeInstanceOf(GoogleNietBeschikbaar);
    expect(haal).not.toHaveBeenCalled();
  });

  it('korte invoer roept Google niet aan', async () => {
    const haal = antwoord({});
    expect(await zoekPlaatsen(' ab ', 's1', haal)).toEqual([]);
    expect(haal).not.toHaveBeenCalled();
  });

  it('vertaalt suggesties en stuurt de juiste aanvraag', async () => {
    const haal = antwoord({
      suggestions: [
        { placePrediction: { placeId: 'p1', structuredFormat: { mainText: { text: 'Dorpsstraat 4' }, secondaryText: { text: 'Rijsbergen' } } } },
        { queryPrediction: { text: { text: 'negeer mij' } } },
        { placePrediction: { placeId: 'p2', text: { text: 'Industrieweg 12, Breda' } } },
      ],
    });
    expect(await zoekPlaatsen('Dorpsstraat', 'sessie-1', haal)).toEqual([
      { placeId: 'p1', hoofdtekst: 'Dorpsstraat 4', subtekst: 'Rijsbergen' },
      { placeId: 'p2', hoofdtekst: 'Industrieweg 12, Breda', subtekst: '' },
    ]);
    const [url, init] = haal.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://places.googleapis.com/v1/places:autocomplete');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['X-Goog-Api-Key']).toBe('test-sleutel');
    expect(JSON.parse(String(init.body))).toEqual({
      input: 'Dorpsstraat', sessionToken: 'sessie-1', languageCode: 'nl', includedRegionCodes: ['nl', 'be'],
    });
  });

  it('foutstatus of netwerkfout: niet beschikbaar', async () => {
    await expect(zoekPlaatsen('Dorpsstraat', 's', antwoord({}, 500))).rejects.toBeInstanceOf(GoogleNietBeschikbaar);
    const kapot = vi.fn(async () => { throw new Error('netwerk'); }) as unknown as typeof fetch;
    await expect(zoekPlaatsen('Dorpsstraat', 's', kapot)).rejects.toBeInstanceOf(GoogleNietBeschikbaar);
  });

  it('haalt details op met veldmasker', async () => {
    const haal = antwoord({
      id: 'p1', displayName: { text: 'Banden-Plus' }, formattedAddress: 'Industrieweg 12, 4811 Breda',
      location: { latitude: 51.589, longitude: 4.776 },
    });
    expect(await plaatsDetails('p1', 'sessie-1', haal)).toEqual({
      placeId: 'p1', naam: 'Banden-Plus', adres: 'Industrieweg 12, 4811 Breda', lat: 51.589, lng: 4.776,
    });
    const [url, init] = haal.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://places.googleapis.com/v1/places/p1?sessionToken=sessie-1&languageCode=nl');
    expect((init.headers as Record<string, string>)['X-Goog-FieldMask']).toBe('id,displayName,formattedAddress,location');
  });

  it('weigert een vreemde placeId en onvolledige details', async () => {
    await expect(plaatsDetails('../x', 's', antwoord({}))).rejects.toThrow('Ongeldige plaats');
    await expect(plaatsDetails('p1', 's', antwoord({ id: 'p1' }))).rejects.toBeInstanceOf(GoogleNietBeschikbaar);
  });

  it('slaat suggesties zonder placeId over', async () => {
    const haal = antwoord({
      suggestions: [
        { placePrediction: { text: { text: 'Zonder id' } } },
        { placePrediction: { placeId: 'p3', text: { text: 'Met id' } } },
      ],
    });
    expect(await zoekPlaatsen('Dorpsstraat', 's', haal)).toEqual([{ placeId: 'p3', hoofdtekst: 'Met id', subtekst: '' }]);
  });

  it('details met ongeldige coördinaten: niet beschikbaar', async () => {
    const zonderLat = antwoord({ id: 'p1', formattedAddress: 'Industrieweg 12', location: { longitude: 4.776 } });
    await expect(plaatsDetails('p1', 's', zonderLat)).rejects.toBeInstanceOf(GoogleNietBeschikbaar);
    const tekstLat = antwoord({ id: 'p1', formattedAddress: 'Industrieweg 12', location: { latitude: 'x', longitude: 4.776 } });
    await expect(plaatsDetails('p1', 's', tekstLat)).rejects.toBeInstanceOf(GoogleNietBeschikbaar);
  });

  it('antwoord dat geen JSON is: niet beschikbaar', async () => {
    const html = vi.fn(async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch;
    await expect(zoekPlaatsen('Dorpsstraat', 's', html)).rejects.toBeInstanceOf(GoogleNietBeschikbaar);
    const html2 = vi.fn(async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch;
    await expect(plaatsDetails('p1', 's', html2)).rejects.toBeInstanceOf(GoogleNietBeschikbaar);
  });

  it('timeout tijdens het lezen van het antwoord: niet beschikbaar', async () => {
    const leesfout = vi.fn(async () => ({
      ok: true,
      json: async () => { throw new DOMException('timeout', 'TimeoutError'); },
    })) as unknown as typeof fetch;
    await expect(zoekPlaatsen('Dorpsstraat', 's', leesfout)).rejects.toBeInstanceOf(GoogleNietBeschikbaar);
  });

  it('antwoord dat geen object is: niet beschikbaar', async () => {
    await expect(zoekPlaatsen('Dorpsstraat', 's', antwoord(null))).rejects.toBeInstanceOf(GoogleNietBeschikbaar);
    await expect(plaatsDetails('p1', 's', antwoord(null))).rejects.toBeInstanceOf(GoogleNietBeschikbaar);
  });
});
