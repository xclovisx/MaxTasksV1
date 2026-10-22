import { luisterNaarWijzigingen } from '@/lib/db/gebeurtenissen';
import { haalBord } from '@/lib/diensten/borden';
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
    } catch {
      return new Response('Niet gevonden', { status: 404 });
    }
  }

  const encoder = new TextEncoder();
  let stop: (() => Promise<void>) | undefined;
  let ping: ReturnType<typeof setInterval> | undefined;
  const opruimen = () => {
    clearInterval(ping);
    void stop?.();
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
      stuur(': verbonden\n\n');
      stop = await luisterNaarWijzigingen((id) => {
        if (alle || id === bordId) stuur(`data: ${id}\n\n`);
      });
      ping = setInterval(() => stuur(': ping\n\n'), 25_000);
      verzoek.signal.addEventListener('abort', () => {
        opruimen();
        try { controller.close(); } catch { /* al gesloten */ }
      });
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
