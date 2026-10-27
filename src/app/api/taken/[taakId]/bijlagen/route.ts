import { verwerkUpload } from '@/lib/web/bijlagen-http';
import { huidigeGebruiker } from '@/lib/web/huidige-gebruiker';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(verzoek: Request, { params }: { params: Promise<{ taakId: string }> }) {
  const { taakId } = await params;
  return verwerkUpload(verzoek, await huidigeGebruiker(), taakId);
}
