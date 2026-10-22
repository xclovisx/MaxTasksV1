import Link from 'next/link';
import { activeerLinkActie } from '../acties';
import { AuthKader } from '@/components/auth/auth-kader';
import { WachtwoordFormulier } from '@/components/auth/wachtwoord-formulier';
import { activatieVoorToken, ONGELDIGE_ACTIVATIE } from '@/lib/auth/activatie';

export default async function ActiverenMetLinkPagina({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const activatie = await activatieVoorToken(token);
  if (!activatie) {
    return (
      <AuthKader titel="Link niet geldig">
        <p className="text-sm text-tekst-zacht">{ONGELDIGE_ACTIVATIE}</p>
        <p className="mt-6 text-sm"><Link href="/activeren" className="underline underline-offset-4">Ik heb een activatiecode</Link></p>
      </AuthKader>
    );
  }
  return (
    <AuthKader titel={`Welkom, ${activatie.naam}`} ondertitel="Kies een wachtwoord om je account te activeren.">
      <WachtwoordFormulier actie={activeerLinkActie.bind(null, token)} />
    </AuthKader>
  );
}
