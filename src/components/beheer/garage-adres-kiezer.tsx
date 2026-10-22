'use client';

import { useState } from 'react';
import { LocatieZoeker } from '@/components/locaties/locatie-zoeker';
import { Knop } from '@/components/ui';
import type { Locatie } from '@/lib/diensten/locaties';

type Adres = { adres: string; lat: number | null; lng: number | null };

export function GarageAdresKiezer({ begin, opgeslagen }: { begin: Adres | null; opgeslagen: Locatie[] }) {
  const [adres, setAdres] = useState<Adres | null>(begin);
  return (
    <div className="space-y-2">
      <input type="hidden" name="garageAdres" value={adres?.adres ?? ''} />
      <input type="hidden" name="garageLat" value={adres?.lat ?? ''} />
      <input type="hidden" name="garageLng" value={adres?.lng ?? ''} />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xs font-medium text-tekst-zacht">Adres van de garage:</span>
        <span>{adres ? adres.adres : 'nog niet ingesteld'}</span>
        {adres && adres.lat === null && <span className="text-xs text-fout">zonder coördinaten, kies het adres opnieuw</span>}
        {adres && <Knop variant="stil" className="h-7 px-2 text-xs" onClick={() => setAdres(null)}>Wis</Knop>}
      </div>
      <LocatieZoeker
        opgeslagen={opgeslagen}
        nieuwBewaren={false}
        label="Zoek het adres van de garage"
        onKies={(s) => setAdres({ adres: s.adres, lat: s.lat, lng: s.lng })}
      />
      <p className="text-xs text-tekst-flauw">Wordt het eindpunt van routes. Vergeet niet op te slaan.</p>
    </div>
  );
}
