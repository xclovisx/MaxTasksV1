import { redirect } from 'next/navigation';
import { lijstBorden } from '@/lib/diensten/borden';
import { vereisGebruiker } from '@/lib/web/huidige-gebruiker';

export default async function Start() {
  const g = await vereisGebruiker();
  const [eerste] = await lijstBorden();
  if (eerste) redirect(`/bord/${eerste.id}`);
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center text-sm text-tekst-zacht">
      {g.rol === 'beheerder'
        ? 'Er zijn nog geen borden. Maak er een aan in Beheer → Borden.'
        : 'Er is nog geen bord. Vraag de beheerder om er een aan te maken.'}
    </div>
  );
}
