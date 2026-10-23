/** Leest de Google-sleutel; zonder sleutel gooit hij de fout van de aanroeper. */
export function googleSleutel(fout: () => Error): string {
  const k = process.env.GOOGLE_MAPS_API_KEY;
  if (!k) throw fout();
  return k;
}

/** Roept Google aan en geeft het JSON-object terug. Elke storing (netwerk, timeout, status, onleesbaar antwoord) wordt `fout()`. */
export async function vraagGoogle(
  haal: typeof fetch,
  url: string,
  init: RequestInit,
  opties: { timeoutMs: number; fout: () => Error },
): Promise<object> {
  let r: Response;
  try {
    r = await haal(url, { ...init, signal: AbortSignal.timeout(opties.timeoutMs) });
  } catch {
    throw opties.fout();
  }
  if (!r.ok) throw opties.fout();
  let data: unknown;
  try {
    data = await r.json();
  } catch {
    throw opties.fout();
  }
  if (typeof data !== 'object' || data === null) throw opties.fout();
  return data;
}
