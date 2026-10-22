import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthKader } from '@/components/auth/auth-kader';
import { InlogFormulier } from '@/components/auth/inlog-formulier';
import { huidigeGebruiker } from '@/lib/web/huidige-gebruiker';

export default async function LoginPagina() {
  if (await huidigeGebruiker()) redirect('/');
  return (
    <AuthKader titel="Inloggen" ondertitel="Log in met je gebruikersnaam en wachtwoord.">
      <InlogFormulier />
      <p className="mt-6 text-center text-sm text-tekst-zacht">
        Nieuw account of wachtwoord vergeten? Vraag de beheerder om een code.{' '}
        <Link href="/activeren" className="font-medium text-tekst underline-offset-4 hover:underline">Ik heb een activatiecode</Link>
      </p>
    </AuthKader>
  );
}
