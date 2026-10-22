import Link from 'next/link';
import { activeerCodeActie } from './acties';
import { AuthKader } from '@/components/auth/auth-kader';
import { WachtwoordFormulier } from '@/components/auth/wachtwoord-formulier';

export default function ActiverenMetCodePagina() {
  return (
    <AuthKader titel="Account activeren" ondertitel="Vul je gebruikersnaam en de 6-cijferige code van de beheerder in, en kies een wachtwoord.">
      <WachtwoordFormulier actie={activeerCodeActie} metCode />
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="text-tekst-zacht underline-offset-4 hover:underline">Terug naar inloggen</Link>
      </p>
    </AuthKader>
  );
}
