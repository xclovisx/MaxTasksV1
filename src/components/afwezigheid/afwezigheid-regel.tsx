'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { verwijderAfwezigheidActie } from '@/app/(app)/beschikbaarheid/acties';
import { Knop, Melding } from '@/components/ui';
import { type Afwezigheid, herhalingTekst, periodeTekst, tijdvakLabel } from '@/lib/domein/afwezigheid';
import { AfwezigheidFormulier } from './afwezigheid-formulier';

export function AfwezigheidRegel({ blok }: { blok: Afwezigheid }) {
  const router = useRouter();
  const [bewerken, setBewerken] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, start] = useTransition();

  if (bewerken) {
    return (
      <li className="py-3">
        <AfwezigheidFormulier begin={blok} standaardDatum={blok.begindatum} onKlaar={() => setBewerken(false)} />
      </li>
    );
  }

  function verwijder() {
    if (!confirm('Dit blok verwijderen?')) return;
    start(async () => {
      const r = await verwijderAfwezigheidActie(blok.id);
      if (!r.ok) setFout(r.fout);
      router.refresh();
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <div className="min-w-48 flex-1">
        <p className="text-sm font-medium">{periodeTekst(blok)} · {tijdvakLabel(blok)}</p>
        <p className="text-xs text-tekst-flauw">{herhalingTekst(blok)}{blok.reden ? ` · ${blok.reden}` : ''}</p>
        {fout && <Melding>{fout}</Melding>}
      </div>
      <Knop variant="secundair" onClick={() => setBewerken(true)}>Wijzigen</Knop>
      <Knop variant="gevaar" onClick={verwijder} disabled={bezig}>Verwijderen</Knop>
    </li>
  );
}
