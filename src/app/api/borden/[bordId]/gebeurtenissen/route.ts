import { luisterNaarWijzigingen } from '@/lib/db/gebeurtenissen';
import { haalBord } from '@/lib/diensten/borden';
import { NietGevonden } from '@/lib/fouten';
import { huidigeGebruiker } from '@/lib/web/huidige-gebruiker';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(verzoek: Request, { params }: { params: Promise<{ bordId: string }> }) {
  const gebruiker = await huidigeGebruiker();
  if (!gebruiker) return new Response('Niet ingelogd', { status: 401 });
  const { bordId } = await params;
  const alle = bordId === 'alle';
  if (alle && gebruiker.rol !== 'beheerder') return new Response('Geen toegang', { status: 403 });
  if (!alle) {
    try {
      await haalBord(bordId);
    } catch (e) {
      if (e instanceof NietGevonden) return new Response('Niet gevonden', { status: 404 });
      return new Response('Tijdelijk niet beschikbaar', { status: 503 });
    }
  }

  const encoder = new TextEncoder();
  let stop: (() => Promise<void>) | undefined;
  let ping: ReturnType<typeof setInterval> | undefined;
  const opruimen = () => {
    clearInterval(ping);
    void stop?.().catch(() => {});
    stop = undefined;
  };

  const stroom = new ReadableStream<Uint8Array>({
    async start(controller) {
      const stuur = (tekst: string) => {
        try {
          controller.enqueue(encoder.encode(tekst));
        } catch {
          opruimen();
        }
      };
      // Eerst de abort-listener, zodat een verbinding die tijdens het wachten wegvalt niet lekt.
      verzoek.signal.addEventListener('abort', () => {
        opruimen();
        try { controller.close(); } catch { /* al gesloten */ }
      });
      stuur(': verbonden\n\n');
      const unlisten = await luisterNaarWijzigingen((id) => {
        if (alle || id === bordId) stuur(`data: ${id}\n\n`);
      });
      if (verzoek.signal.aborted) {
        void unlisten().catch(() => {});
        return;
      }
      stop = unlisten;
      ping = setInterval(() => stuur(': ping\n\n'), 25_000);
    },
    cancel: opruimen,
  });

  return new Response(stroom, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
