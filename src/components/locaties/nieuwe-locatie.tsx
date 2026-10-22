'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { maakLocatieActie } from '@/app/(app)/locaties/acties';
import { Melding } from '@/components/ui';
import type { Locatie } from '@/lib/diensten/locaties';
import { LocatieZoeker } from './locatie-zoeker';

export function NieuweLocatie({ opgeslagen }: { opgeslagen: Locatie[] }) {
  const router = useRouter();
  const [melding, setMelding] = useState<{ tekst: string; soort: 'fout' | 'info' } | null>(null);
  const [, start] = useTransition();
  return (
    <div className="space-y-2">
      <LocatieZoeker
        opgeslagen={opgeslagen}
        nieuwBewaren={false}
        label="Zoek een adres om op te slaan"
        onKies={(s) => {
          if (s.locatieId) {
            setMelding({ tekst: `${s.naam} staat al in de lijst.`, soort: 'info' });
            return;
          }
          start(async () => {
            const r = await maakLocatieActie(s);
            if (!r.ok) return setMelding({ tekst: r.fout, soort: 'fout' });
            setMelding({ tekst: `${s.naam} is opgeslagen.`, soort: 'info' });
            router.refresh();
          });
        }}
      />
      {melding && <Melding soort={melding.soort}>{melding.tekst}</Melding>}
    </div>
  );
}
