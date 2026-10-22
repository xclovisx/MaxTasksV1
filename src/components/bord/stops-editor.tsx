'use client';

import { KruisIcoon } from '@/components/iconen';
import { alsStop, LocatieZoeker } from '@/components/locaties/locatie-zoeker';
import { Invoer } from '@/components/ui';
import type { Locatie } from '@/lib/diensten/locaties';
import { MAX_STOPS, type StopInvoer } from '@/lib/domein/validatie';

export function StopsEditor({
  stops,
  onChange,
  opgeslagen,
  vaakGebruikt,
}: {
  stops: StopInvoer[];
  onChange: (stops: StopInvoer[]) => void;
  opgeslagen: Locatie[];
  vaakGebruikt: Locatie[];
}) {
  const vol = stops.length >= MAX_STOPS;
  const voegToe = (s: StopInvoer) => { if (!vol) onChange([...stops, s]); };
  const wijzig = (i: number, deel: Partial<StopInvoer>) => onChange(stops.map((s, j) => (j === i ? { ...s, ...deel } : s)));
  const verwijder = (i: number) => onChange(stops.filter((_, j) => j !== i));

  return (
    <fieldset className="space-y-2">
      <legend className="mb-1.5 text-xs font-medium text-tekst-zacht">Locaties (optioneel, maximaal {MAX_STOPS})</legend>
      {stops.length > 0 && (
        <ol className="space-y-1.5">
          {stops.map((s, i) => (
            <li key={`${i}-${s.adres}`} className="flex items-start gap-2 rounded-lg border border-rand bg-achtergrond px-2.5 py-2">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-kaart-hover text-[11px] font-semibold">{i + 1}</span>
              <div className="min-w-0 flex-1">
                {s.locatieId === null && s.bewaar ? (
                  <Invoer aria-label={`Naam voor ${s.adres}`} value={s.naam} onChange={(e) => wijzig(i, { naam: e.target.value })} className="h-8" maxLength={100} />
                ) : (
                  <p className="truncate text-sm font-medium">{s.naam}</p>
                )}
                <p className="truncate text-xs text-tekst-flauw">{s.adres}</p>
                {s.locatieId === null && (
                  <label className="mt-1 flex items-center gap-1.5 text-xs text-tekst-zacht">
                    <input type="checkbox" checked={s.bewaar} onChange={(e) => wijzig(i, { bewaar: e.target.checked })} className="size-3.5 accent-accent" />
                    Bewaar als vaste locatie
                  </label>
                )}
              </div>
              <button type="button" onClick={() => verwijder(i)} aria-label={`Verwijder ${s.naam}`} className="rounded p-1 text-tekst-flauw hover:bg-kaart hover:text-tekst">
                <KruisIcoon />
              </button>
            </li>
          ))}
        </ol>
      )}
      {vol ? (
        <p className="text-xs text-tekst-flauw">Maximaal {MAX_STOPS} locaties.</p>
      ) : (
        <>
          <LocatieZoeker opgeslagen={opgeslagen} onKies={voegToe} />
          {vaakGebruikt.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-tekst-flauw">Vaak gebruikt:</span>
              {vaakGebruikt.map((l) => (
                <button key={l.id} type="button" onClick={() => voegToe(alsStop(l))}
                  className="rounded-full bg-kaart px-2.5 py-1 text-xs text-tekst-zacht hover:bg-kaart-hover hover:text-tekst">
                  {l.naam}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </fieldset>
  );
}
