import { verwerkDownload } from '@/lib/web/bijlagen-http';
import { huidigeGebruiker } from '@/lib/web/huidige-gebruiker';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_verzoek: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return verwerkDownload(await huidigeGebruiker(), id);
}
