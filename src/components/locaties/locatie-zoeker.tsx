'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { plaatsDetailsActie, zoekPlaatsenActie } from '@/app/(app)/locaties/acties';
import { Invoer, Melding } from '@/components/ui';
import type { Locatie } from '@/lib/diensten/locaties';
import type { StopInvoer } from '@/lib/domein/validatie';
import type { Suggestie } from '@/lib/google/plaatsen';

export function alsStop(l: Locatie): StopInvoer {
  return { naam: l.naam, adres: l.adres, lat: l.lat, lng: l.lng, googlePlaceId: l.googlePlaceId, locatieId: l.id, bewaar: false };
}

const OPTIE = 'flex w-full flex-col px-3 py-1.5 text-left hover:bg-kaart-hover focus-visible:bg-kaart-hover focus-visible:outline-none';

export function LocatieZoeker({
  opgeslagen,
  onKies,
  label = 'Zoek adres of opgeslagen locatie',
  nieuwBewaren = true,
}: {
  opgeslagen: Locatie[];
  onKies: (stop: StopInvoer) => void;
  label?: string;
  nieuwBewaren?: boolean;
}) {
  const id = useId();
  const [tekst, setTekst] = useState('');
  const [suggesties, setSuggesties] = useState<Suggestie[]>([]);
  const [fout, setFout] = useState<string | null>(null);
  const [laden, setLaden] = useState(false);
  const sessie = useRef<string>(crypto.randomUUID());

  const term = tekst.trim().toLowerCase();
  const eigen = term
    ? opgeslagen.filter((l) => l.naam.toLowerCase().includes(term) || l.adres.toLowerCase().includes(term)).slice(0, 5)
    : [];

  useEffect(() => {
    if (tekst.trim().length < 3) {
      setSuggesties([]);
      setFout(null);
      return;
    }
    let actueel = true;
    const timer = setTimeout(async () => {
      const r = await zoekPlaatsenActie(tekst, sessie.current);
      if (!actueel) return;
      if (r.ok) {
        setSuggesties(r.data);
        setFout(null);
      } else {
        setSuggesties([]);
        setFout(r.fout);
      }
    }, 300);
    return () => {
      actueel = false;
      clearTimeout(timer);
    };
  }, [tekst]);

  function herstel() {
    setTekst('');
    setSuggesties([]);
    setFout(null);
    sessie.current = crypto.randomUUID();
  }

  async function kiesSuggestie(s: Suggestie) {
    setLaden(true);
    const r = await plaatsDetailsActie(s.placeId, sessie.current);
    setLaden(false);
    if (!r.ok) {
      setFout(r.fout);
      return;
    }
    onKies({
      naam: r.data.naam, adres: r.data.adres, lat: r.data.lat, lng: r.data.lng,
      googlePlaceId: r.data.placeId, locatieId: null, bewaar: nieuwBewaren,
    });
    herstel();
  }

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-tekst-zacht">{label}</label>
      <Invoer
        id={id}
        value={tekst}
        onChange={(e) => setTekst(e.target.value)}
        // Enter mag het omliggende taakformulier niet versturen.
        onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
        placeholder="Bijv. Banden-Plus of Dorpsstraat 4"
        autoComplete="off"
      />
      {(eigen.length > 0 || suggesties.length > 0) && (
        <div role="listbox" aria-label="Zoekresultaten" className="mt-1 max-h-64 overflow-y-auto rounded-lg border border-rand bg-kaart py-1 text-sm shadow-xl">
          {eigen.map((l) => (
            <button key={l.id} type="button" role="option" aria-selected={false} className={OPTIE}
              onClick={() => { onKies(alsStop(l)); herstel(); }}>
              <span className="font-medium">{l.naam}</span>
              <span className="text-xs text-tekst-flauw">{l.adres} · opgeslagen</span>
            </button>
          ))}
          {suggesties.map((s) => (
            <button key={s.placeId} type="button" role="option" aria-selected={false} disabled={laden} className={OPTIE}
              onClick={() => void kiesSuggestie(s)}>
              <span className="font-medium">{s.hoofdtekst}</span>
              {s.subtekst && <span className="text-xs text-tekst-flauw">{s.subtekst}</span>}
            </button>
          ))}
        </div>
      )}
      {fout && <div className="mt-1"><Melding>{fout}</Melding></div>}
    </div>
  );
}
