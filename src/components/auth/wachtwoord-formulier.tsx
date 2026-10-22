'use client';

import { useActionState } from 'react';
import { Invoer, Knop, Melding, Veld } from '@/components/ui';
import type { FormStaat } from '@/lib/web/actie';

export function WachtwoordFormulier({
  actie,
  metCode = false,
}: {
  actie: (staat: FormStaat, form: FormData) => Promise<FormStaat>;
  metCode?: boolean;
}) {
  const [staat, verstuur, bezig] = useActionState(actie, null);
  return (
    <form action={verstuur} className="space-y-4">
      {metCode && (
        <>
          <Veld label="Gebruikersnaam">
            <Invoer name="gebruikersnaam" autoComplete="username" autoCapitalize="none" required />
          </Veld>
          <Veld label="Activatiecode">
            <Invoer name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required />
          </Veld>
        </>
      )}
      <Veld label="Nieuw wachtwoord" hint="Minimaal 8 tekens">
        <Invoer name="wachtwoord" type="password" autoComplete="new-password" minLength={8} required />
      </Veld>
      <Veld label="Herhaal wachtwoord">
        <Invoer name="herhaal" type="password" autoComplete="new-password" minLength={8} required />
      </Veld>
      {staat?.fout && <Melding>{staat.fout}</Melding>}
      <Knop type="submit" className="w-full" disabled={bezig}>{bezig ? 'Bezig…' : 'Wachtwoord instellen'}</Knop>
    </form>
  );
}
