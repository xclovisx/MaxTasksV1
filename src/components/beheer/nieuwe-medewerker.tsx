'use client';

import { useState } from 'react';
import { maakMedewerkerActie } from '@/app/(app)/beheer/acties';
import { ActieFormulier } from '@/components/actie-formulier';
import { Invoer, Veld } from '@/components/ui';
import type { ActivatieWeergave } from '@/lib/web/actie';
import { ActivatieKaart } from './activatie-kaart';

export function NieuweMedewerker() {
  const [activatie, setActivatie] = useState<ActivatieWeergave | null>(null);
  return (
    <>
      <ActieFormulier actie={maakMedewerkerActie} knop="Medewerker toevoegen" bijSucces={setActivatie}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Veld label="Naam"><Invoer name="naam" required maxLength={100} /></Veld>
          <Veld label="Gebruikersnaam">
            <Invoer name="gebruikersnaam" required autoCapitalize="none" pattern="[A-Za-z0-9._\-]{3,32}" />
          </Veld>
        </div>
      </ActieFormulier>
      {activatie && <ActivatieKaart activatie={activatie} />}
    </>
  );
}
