'use client';

import { useState, useTransition } from 'react';
import { stuurTestmeldingActie } from '@/app/(app)/beheer/acties';
import { Knop, Melding } from '@/components/ui';

export function TestmeldingKnop() {
  const [uitkomst, setUitkomst] = useState<{ ok: boolean; tekst: string } | null>(null);
  const [bezig, start] = useTransition();

  function versturen() {
    setUitkomst(null);
    start(async () => {
      const r = await stuurTestmeldingActie();
      setUitkomst(r.ok ? { ok: true, tekst: 'Testmelding verstuurd. Kijk op je telefoon.' } : { ok: false, tekst: r.fout });
    });
  }

  return (
    <div className="space-y-2">
      <Knop variant="secundair" onClick={versturen} disabled={bezig}>{bezig ? 'Versturen…' : 'Stuur testmelding'}</Knop>
      {uitkomst && <Melding soort={uitkomst.ok ? 'info' : 'fout'}>{uitkomst.tekst}</Melding>}
    </div>
  );
}
