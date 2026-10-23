import type { NtfyBericht } from '../domein/meldingen';
import { Fout } from '../fouten';

export class NtfyNietIngesteld extends Fout {
  constructor() {
    super('Meldingen zijn niet ingesteld: vul NTFY_URL in .env en een onderwerp bij Meldingen.');
  }
}

export class NtfyMislukt extends Fout {
  constructor() {
    super('De melding kon niet verstuurd worden. Controleer NTFY_URL, het token en het onderwerp.');
  }
}

const TIMEOUT_MS = 5000;

/** De ntfy-server uit .env, zonder slash aan het eind; null als die ontbreekt. */
export function ntfyServer(): string | null {
  return process.env.NTFY_URL?.trim().replace(/\/+$/, '') || null;
}

/** Publiceert via ntfy's JSON-API (POST naar de server-root), zodat titel en tekst UTF-8 mogen bevatten. */
export async function stuurNtfy(onderwerp: string, b: NtfyBericht, haal: typeof fetch = fetch): Promise<void> {
  const server = ntfyServer();
  if (!server) throw new NtfyNietIngesteld();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = process.env.NTFY_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  let r: Response;
  try {
    r = await haal(server, {
      method: 'POST',
      headers,
      body: JSON.stringify({ topic: onderwerp, title: b.titel, message: b.tekst, priority: b.prioriteit, tags: b.tags, click: b.link }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new NtfyMislukt();
  }
  if (!r.ok) throw new NtfyMislukt();
}
