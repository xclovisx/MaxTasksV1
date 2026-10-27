import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import type { SessieGebruiker } from '../auth/sessies';
import { tekenCode } from '../codes';
import { haalBijlage, haalCode, voegBijlageToe } from '../diensten/bijlagen';
import { MAX_BIJLAGE_BYTES } from '../domein/bijlagen';
import { Fout, NietGevonden, OpslagOntbreekt, TeGroot, TeVeelBijlagen } from '../fouten';

/** Ruimte voor de multipart-omhulling rond het bestand. */
const MARGE = 64 * 1024;

const fout = (status: number, tekst: string) => Response.json({ fout: tekst }, { status });

function statusVoor(e: Fout): number {
  if (e instanceof NietGevonden) return 404;
  if (e instanceof TeVeelBijlagen) return 409;
  if (e instanceof TeGroot) return 413;
  if (e instanceof OpslagOntbreekt) return 503;
  return 400;
}

/** Route handlers hebben geen ingebouwde CSRF-check zoals server actions; daarom de Origin zelf vergelijken. */
export function zelfdeHerkomst(verzoek: Request, appUrl: string | undefined): boolean {
  const origin = verzoek.headers.get('origin');
  if (!origin || !appUrl) return false;
  try {
    return new URL(origin).origin === new URL(appUrl).origin;
  } catch {
    return false;
  }
}

/** Leest de stroom tot maximaal `max` bytes; bij meer wordt de stroom afgebroken en komt er null terug. */
async function leesBegrensd(stroom: ReadableStream<Uint8Array>, max: number): Promise<Uint8Array<ArrayBuffer> | null> {
  const lezer = stroom.getReader();
  const stukken: Uint8Array[] = [];
  let totaal = 0;
  for (;;) {
    const { done, value } = await lezer.read();
    if (done) break;
    totaal += value.byteLength;
    if (totaal > max) {
      await lezer.cancel();
      return null;
    }
    stukken.push(value);
  }
  const alles = new Uint8Array(totaal);
  let positie = 0;
  for (const stuk of stukken) {
    alles.set(stuk, positie);
    positie += stuk.byteLength;
  }
  return alles;
}

export async function verwerkUpload(
  verzoek: Request, gebruiker: SessieGebruiker | null, taakId: string, appUrl = process.env.APP_URL,
): Promise<Response> {
  if (!gebruiker) return fout(401, 'Niet ingelogd');
  if (!zelfdeHerkomst(verzoek, appUrl)) return fout(403, 'Verzoek geweigerd');
  // Vóór het inlezen afkappen, zodat een enorm verzoek niet in het geheugen belandt.
  if (Number(verzoek.headers.get('content-length') ?? 0) > MAX_BIJLAGE_BYTES + MARGE) return fout(413, 'Te groot (max 10 MB).');
  if (!verzoek.body) return fout(400, 'Geen bestand meegestuurd');
  // Ook zonder Content-Length (chunked) nooit meer dan de limiet inlezen.
  let bytes: Uint8Array<ArrayBuffer> | null;
  try {
    bytes = await leesBegrensd(verzoek.body, MAX_BIJLAGE_BYTES + MARGE);
  } catch {
    return fout(400, 'Ongeldig verzoek');
  }
  if (!bytes) return fout(413, 'Te groot (max 10 MB).');
  let bestand: FormDataEntryValue | null;
  try {
    const contentType = verzoek.headers.get('content-type') ?? '';
    bestand = (await new Response(bytes, { headers: { 'content-type': contentType } }).formData()).get('bestand');
  } catch {
    return fout(400, 'Ongeldig verzoek');
  }
  if (!(bestand instanceof File)) return fout(400, 'Geen bestand meegestuurd');
  try {
    const inhoud = new Uint8Array(await bestand.arrayBuffer());
    const b = await voegBijlageToe({ gebruikerId: gebruiker.id, rol: gebruiker.rol }, taakId, { naam: bestand.name, inhoud });
    return Response.json(b, { status: 201 });
  } catch (e) {
    if (e instanceof Fout) return fout(statusVoor(e), e.message);
    const code = crypto.randomUUID().slice(0, 8);
    console.error(`[fout ${code}]`, e);
    return fout(500, `Er ging iets mis (foutcode ${code}). Probeer het opnieuw.`);
  }
}

export async function verwerkDownload(gebruiker: SessieGebruiker | null, id: string): Promise<Response> {
  if (!gebruiker) return fout(401, 'Niet ingelogd');
  let b: Awaited<ReturnType<typeof haalBijlage>>;
  try {
    b = await haalBijlage(id);
  } catch (e) {
    if (e instanceof NietGevonden) return fout(404, e.message);
    throw e;
  }
  let grootte: number;
  try {
    grootte = (await stat(b.pad)).size;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return fout(404, 'Bestand niet gevonden');
    console.error('[bijlagen] bestand lezen mislukt', e);
    throw e;
  }
  return new Response(Readable.toWeb(createReadStream(b.pad)) as ReadableStream<Uint8Array>, {
    headers: {
      'Content-Type': b.type,
      'Content-Length': String(grootte),
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(b.naam)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}

export async function verwerkCode(gebruiker: SessieGebruiker | null, id: string): Promise<Response> {
  if (!gebruiker) return fout(401, 'Niet ingelogd');
  let code: Awaited<ReturnType<typeof haalCode>>;
  try {
    code = await haalCode(id);
  } catch (e) {
    if (e instanceof NietGevonden) return fout(404, e.message);
    throw e;
  }
  const svg = await tekenCode(code);
  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
