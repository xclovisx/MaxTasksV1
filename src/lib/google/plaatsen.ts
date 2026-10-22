import { Fout, Ongeldig } from '../fouten';

export class GoogleNietBeschikbaar extends Fout {
  constructor() {
    super('Adres zoeken tijdelijk niet beschikbaar');
  }
}

export type Suggestie = { placeId: string; hoofdtekst: string; subtekst: string };
export type Plaats = { placeId: string; naam: string; adres: string; lat: number; lng: number };

const BASIS = 'https://places.googleapis.com/v1';
const TIMEOUT_MS = 5000;

function sleutel(): string {
  const k = process.env.GOOGLE_MAPS_API_KEY;
  if (!k) throw new GoogleNietBeschikbaar();
  return k;
}

async function vraag(haal: typeof fetch, url: string, init: RequestInit): Promise<unknown> {
  let r: Response;
  try {
    r = await haal(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new GoogleNietBeschikbaar();
  }
  if (!r.ok) throw new GoogleNietBeschikbaar();
  let data: unknown;
  try {
    data = await r.json();
  } catch {
    throw new GoogleNietBeschikbaar();
  }
  if (typeof data !== 'object' || data === null) throw new GoogleNietBeschikbaar();
  return data;
}

type AutocompleteAntwoord = {
  suggestions?: {
    placePrediction?: {
      placeId: string;
      text?: { text: string };
      structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } };
    };
  }[];
};

export async function zoekPlaatsen(invoer: string, sessie: string, haal: typeof fetch = fetch): Promise<Suggestie[]> {
  const tekst = invoer.trim().slice(0, 200);
  if (tekst.length < 3) return [];
  const data = (await vraag(haal, `${BASIS}/places:autocomplete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': sleutel() },
    body: JSON.stringify({ input: tekst, sessionToken: sessie, languageCode: 'nl', includedRegionCodes: ['nl', 'be'] }),
  })) as AutocompleteAntwoord;
  return (data.suggestions ?? [])
    .flatMap((s) => {
      const p = s.placePrediction;
      if (!p || typeof p.placeId !== 'string') return [];
      return [{
        placeId: p.placeId,
        hoofdtekst: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
        subtekst: p.structuredFormat?.secondaryText?.text ?? '',
      }];
    })
    .slice(0, 5);
}

type DetailsAntwoord = {
  id?: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
};

export async function plaatsDetails(placeId: string, sessie: string, haal: typeof fetch = fetch): Promise<Plaats> {
  if (!/^[A-Za-z0-9_-]{1,300}$/.test(placeId)) throw new Ongeldig('Ongeldige plaats');
  const url = `${BASIS}/places/${placeId}?sessionToken=${encodeURIComponent(sessie)}&languageCode=nl`;
  const d = (await vraag(haal, url, {
    headers: { 'X-Goog-Api-Key': sleutel(), 'X-Goog-FieldMask': 'id,displayName,formattedAddress,location' },
  })) as DetailsAntwoord;
  const loc = d.location;
  if (!d.formattedAddress || !loc || !Number.isFinite(loc.latitude) || !Number.isFinite(loc.longitude)) {
    throw new GoogleNietBeschikbaar();
  }
  return {
    placeId: d.id ?? placeId,
    naam: (d.displayName?.text ?? d.formattedAddress).slice(0, 100),
    adres: d.formattedAddress.slice(0, 300),
    lat: loc.latitude,
    lng: loc.longitude,
  };
}
