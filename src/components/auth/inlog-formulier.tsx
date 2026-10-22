'use client';

import { useActionState } from 'react';
import { inlogActie } from '@/app/login/acties';
import { Invoer, Knop, Melding, Veld } from '@/components/ui';

export function InlogFormulier() {
  const [staat, verstuur, bezig] = useActionState(inlogActie, null);
  return (
    <form action={verstuur} className="space-y-4">
      <Veld label="Gebruikersnaam">
        <Invoer name="gebruikersnaam" autoComplete="username" autoCapitalize="none" required autoFocus />
      </Veld>
      <Veld label="Wachtwoord">
        <Invoer name="wachtwoord" type="password" autoComplete="current-password" required />
      </Veld>
      {staat?.fout && <Melding>{staat.fout}</Melding>}
      <Knop type="submit" className="w-full" disabled={bezig}>{bezig ? 'Bezig…' : 'Inloggen'}</Knop>
    </form>
  );
}
