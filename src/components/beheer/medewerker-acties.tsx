'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { nieuweLinkActie, zetActiefActie } from '@/app/(app)/beheer/acties';
import { Knop, Melding } from '@/components/ui';
import type { ActivatieWeergave } from '@/lib/web/actie';
import { ActivatieKaart } from './activatie-kaart';

export function MedewerkerActies({ id, naam, actief }: { id: string; naam: string; actief: boolean }) {
  const router = useRouter();
  const [activatie, setActivatie] = useState<ActivatieWeergave | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, start] = useTransition();

  function nieuweLink() {
    if (!confirm(`Nieuwe link maken voor ${naam}? Het huidige wachtwoord vervalt meteen.`)) return;
    start(async () => {
      const r = await nieuweLinkActie(id);
      if (!r.ok) return setFout(r.fout);
      setFout(null);
      setActivatie(r.data);
      router.refresh();
    });
  }

  function wisselActief() {
    if (actief && !confirm(`${naam} deactiveren? Inloggen kan dan niet meer.`)) return;
    start(async () => {
      const r = await zetActiefActie(id, !actief);
      if (!r.ok) return setFout(r.fout);
      setFout(null);
      router.refresh();
    });
  }

  return (
    <div className="w-full sm:w-auto">
      <div className="flex gap-2 sm:justify-end">
        <Knop variant="secundair" onClick={nieuweLink} disabled={bezig}>Nieuwe link</Knop>
        <Knop variant={actief ? 'gevaar' : 'secundair'} onClick={wisselActief} disabled={bezig}>
          {actief ? 'Deactiveren' : 'Activeren'}
        </Knop>
      </div>
      {fout && <div className="mt-2"><Melding>{fout}</Melding></div>}
      {activatie && <ActivatieKaart activatie={activatie} />}
    </div>
  );
}
