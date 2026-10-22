'use client';

import { useCallback, useState } from 'react';
import type { Taak } from '@/lib/diensten/taken';
import { TaakDialoog } from './taak-dialoog';
import { TaakKaartInhoud } from './taak-kaart';

export function VandaagLijst({ taken, legeTekst = 'Geen taken voor vandaag.' }: { taken: Taak[]; legeTekst?: string }) {
  const [open, setOpen] = useState<Taak | null>(null);
  const sluit = useCallback(() => setOpen(null), []);
  if (taken.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-rand p-10 text-center text-sm text-tekst-zacht">
        {legeTekst}
      </p>
    );
  }
  return (
    <>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {taken.map((t) => (
          <li key={t.id}>
            <button type="button" data-taak={t.id} onClick={() => setOpen(t)} className="block w-full text-left">
              <TaakKaartInhoud taak={t} toonBord />
            </button>
          </li>
        ))}
      </ul>
      {open && <TaakDialoog key={open.id} modus={{ soort: 'bewerk', taak: open }} isBeheerder onSluit={sluit} />}
    </>
  );
}
