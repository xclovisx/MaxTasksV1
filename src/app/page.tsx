import Link from 'next/link';
import { uitlogActie } from './login/acties';
import { vereisGebruiker } from '@/lib/web/huidige-gebruiker';

export default async function Start() {
  const g = await vereisGebruiker();
  return (
    <main className="p-8">
      <p>Ingelogd als {g.naam}</p>
      {g.rol === 'beheerder' && <Link href="/beheer" className="underline">Beheer</Link>}
      <form action={uitlogActie}><button type="submit" className="underline">Uitloggen</button></form>
    </main>
  );
}
