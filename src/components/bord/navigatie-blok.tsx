'use client';

import { useState, useTransition } from 'react';
import { planRouteActie } from '@/app/(app)/bord/acties';
import { Knop, Melding } from '@/components/ui';
import type { RoutePlan } from '@/lib/diensten/route';
import type { Stop } from '@/lib/diensten/stops';
import { formatAfstand, formatDuur, navigatieUrl, type Punt } from '@/lib/domein/navigatie';

const LOCATIE_TIMEOUT_MS = 8000;
const ACCENT_LINK =
  'inline-flex shrink-0 items-center justify-center rounded-lg bg-accent font-semibold text-accent-donker hover:bg-accent/90';

/** Huidige locatie van het apparaat, of null als die geweigerd of niet beschikbaar is. */
function huidigeLocatie(): Promise<Punt | null> {
  return new Promise((klaar) => {
    if (!('geolocation' in navigator)) {
      klaar(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => klaar({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => klaar(null),
      { timeout: LOCATIE_TIMEOUT_MS, maximumAge: 60_000 },
    );
  });
}

const reis = (d: { duurSec: number; meters: number }) => `${formatDuur(d.duurSec)} · ${formatAfstand(d.meters)}`;

export function NavigatieBlok({ taakId, stops }: { taakId: string; stops: Stop[] }) {
  const [plan, setPlan] = useState<RoutePlan | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, start] = useTransition();
  const meerdere = stops.length > 1;
  const volgorde = plan?.volgorde ?? stops.map((_, i) => i);
  const terug = plan?.delen?.at(-1);

  function planRoute() {
    setFout(null);
    start(async () => {
      try {
        const r = await planRouteActie(taakId, await huidigeLocatie());
        if (r.ok) setPlan(r.data);
        else setFout(r.fout);
      } catch {
        setFout('Route plannen lukt nu niet. Probeer het opnieuw.');
      }
    });
  }

  return (
    <div className="mb-5 rounded-lg border border-rand bg-achtergrond p-3">
      <span className="mb-2 block text-xs font-medium text-tekst-zacht">{meerdere ? 'Locaties' : 'Locatie'}</span>
      <ol className="space-y-2">
        {volgorde.map((i, n) => {
          const s = stops[i];
          const deel = plan?.delen?.[n];
          return (
            <li key={`${i}-${s.adres}`} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{meerdere ? `${n + 1}. ` : ''}{s.naam}</span>
                <span className="block truncate text-xs text-tekst-flauw">{deel ? `${reis(deel)} rijden · ${s.adres}` : s.adres}</span>
              </span>
              <a
                href={navigatieUrl(s)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Navigeer naar ${s.naam}`}
                className={`${ACCENT_LINK} px-3 py-1.5 text-xs`}
              >
                Navigeer
              </a>
            </li>
          );
        })}
      </ol>
      {meerdere && (
        <div className="mt-3 space-y-2 border-t border-rand-zacht pt-3">
          {plan?.meldingen.map((m) => <Melding key={m} soort="info">{m}</Melding>)}
          {fout && <Melding>{fout}</Melding>}
          {plan && terug && plan.totaalSec !== null && plan.totaalMeters !== null && (
            <p className="text-xs text-tekst-zacht">
              Daarna {reis(terug)} naar {terug.naar}. Totaal {formatDuur(plan.totaalSec)} · {formatAfstand(plan.totaalMeters)}.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Knop variant={plan ? 'secundair' : 'primair'} onClick={planRoute} disabled={bezig}>
              {bezig ? 'Route berekenen…' : plan ? 'Opnieuw plannen' : 'Plan route'}
            </Knop>
            {plan && (
              <a href={plan.url} target="_blank" rel="noopener noreferrer" className={`${ACCENT_LINK} h-9 px-3.5 text-sm`}>
                Start route in Google Maps
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
