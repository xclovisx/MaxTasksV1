import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import type { SessieGebruiker } from '../auth/sessies';
import { haalBijlage, voegBijlageToe } from '../diensten/bijlagen';
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

export async function verwerkUpload(
  verzoek: Request, gebruiker: SessieGebruiker | null, taakId: string, appUrl = process.env.APP_URL,
): Promise<Response> {
  if (!gebruiker) return fout(401, 'Niet ingelogd');
  if (!zelfdeHerkomst(verzoek, appUrl)) return fout(403, 'Verzoek geweigerd');
  // Vóór het inlezen afkappen, zodat een enorm verzoek niet in het geheugen belandt.
  if (Number(verzoek.headers.get('content-length') ?? 0) > MAX_BIJLAGE_BYTES + MARGE) return fout(413, 'Te groot (max 10 MB).');
  let bestand: FormDataEntryValue | null;
  try {
    bestand = (await verzoek.formData()).get('bestand');
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
  } catch {
    return fout(404, 'Bestand niet gevonden');
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
