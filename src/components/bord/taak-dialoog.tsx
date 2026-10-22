'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useRef, useState, useTransition } from 'react';
import {
  historieActie, maakTaakActie, stopReeksActie, verwijderTaakActie, wijzigReeksActie, wijzigTaakActie, zetStatusActie,
} from '@/app/(app)/bord/acties';
import { KruisIcoon } from '@/components/iconen';
import { Invoer, Keuzelijst, Knop, Melding, Tekstvak, Veld } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { HistorieRegel, Taak } from '@/lib/diensten/taken';
import { DAGNAMEN_KORT, type Datum, formatMoment, weekdag } from '@/lib/domein/datums';
import { HERHALING_LABELS, type HerhalingType } from '@/lib/domein/herhaling';
import { PRIORITEIT_LABEL, PRIORITEITEN, type Prioriteit, type Status, STATUS_LABEL, STATUSSEN } from '@/lib/domein/taak';
import type { ActieResultaat } from '@/lib/web/actie';
import { PRIO_KNOP_AAN, STATUS_PIL } from './stijl';

export type DialoogModus = { soort: 'nieuw'; bordId: string; datum: Datum } | { soort: 'bewerk'; taak: Taak };

type Herhalen = 'geen' | HerhalingType;

const VELDNAAM: Record<string, string> = {
  titel: 'titel', omschrijving: 'omschrijving', datum: 'dag', tijd: 'tijd', prioriteit: 'prioriteit', status: 'status',
};

const toon = (w: unknown) => (w === null || w === '' ? '–' : String(w));

export function TaakDialoog({ modus, isBeheerder, onSluit }: { modus: DialoogModus; isBeheerder: boolean; onSluit: () => void }) {
  const router = useRouter();
  const taak = modus.soort === 'bewerk' ? modus.taak : null;
  const startDatum = taak ? taak.datum : modus.soort === 'nieuw' ? modus.datum : '';

  const [titel, setTitel] = useState(taak?.titel ?? '');
  const [omschrijving, setOmschrijving] = useState(taak?.omschrijving ?? '');
  const [datum, setDatum] = useState<Datum>(startDatum);
  const [tijd, setTijd] = useState(taak?.tijd ?? '');
  const [prioriteit, setPrioriteit] = useState<Prioriteit>(taak?.prioriteit ?? 'middel');
  const [herhalen, setHerhalen] = useState<Herhalen>(taak?.herhalingType ?? 'geen');
  const [weekdagen, setWeekdagen] = useState<number[]>(
    taak?.herhalingWeekdagen?.length ? taak.herhalingWeekdagen : [weekdag(startDatum)],
  );
  const [intervalWeken, setIntervalWeken] = useState(Math.max(2, taak?.herhalingInterval ?? 2));
  const [bereik, setBereik] = useState<'deze' | 'reeks'>('deze');
  const [fout, setFout] = useState<{ tekst: string; conflict: boolean } | null>(null);
  const [historie, setHistorie] = useState<HistorieRegel[] | null>(null);
  const [bezig, start] = useTransition();
  const titelRef = useRef<HTMLInputElement>(null);

  const sluitRef = useRef(onSluit);
  useEffect(() => { sluitRef.current = onSluit; });

  // Titel alleen bij het openen focussen; hertekenen van de ouder mag de focus niet stelen.
  useEffect(() => {
    titelRef.current?.focus();
    const bijToets = (e: KeyboardEvent) => { if (e.key === 'Escape') sluitRef.current(); };
    window.addEventListener('keydown', bijToets);
    return () => window.removeEventListener('keydown', bijToets);
  }, []);

  const isReeks = Boolean(taak?.herhalingId);
  const reeksBewerken = isReeks && bereik === 'reeks';
  const herhalingBewerkbaar = modus.soort === 'nieuw' || reeksBewerken;

  function regel() {
    if (herhalen === 'geen') return null;
    return {
      type: herhalen,
      weekdagen: herhalen === 'weekdagen' ? weekdagen : [],
      intervalWeken: herhalen === 'elke_x_weken' ? intervalWeken : 1,
    };
  }

  function afronden(r: ActieResultaat<unknown>) {
    if (!r.ok) {
      setFout({ tekst: r.fout, conflict: Boolean(r.conflict) });
      return;
    }
    onSluit();
    router.refresh();
  }

  function opslaan(e: FormEvent) {
    e.preventDefault();
    setFout(null);
    const velden = { titel, omschrijving, datum, tijd: tijd || null, prioriteit };
    start(async () => {
      if (modus.soort === 'nieuw') {
        afronden(await maakTaakActie({ ...velden, bordId: modus.bordId, herhaling: regel() }));
        return;
      }
      if (!taak) return;
      if (reeksBewerken && taak.herhalingId) {
        const r = regel();
        if (!r) {
          setFout({ tekst: 'Kies hoe de reeks herhaalt, of gebruik "Reeks stoppen".', conflict: false });
          return;
        }
        afronden(await wijzigReeksActie(taak.herhalingId, { titel, omschrijving, tijd: tijd || null, prioriteit, herhaling: r }));
        return;
      }
      afronden(await wijzigTaakActie(taak.id, taak.versie, velden));
    });
  }

  function kiesStatus(s: Status) {
    if (!taak || s === taak.status) return;
    start(async () => afronden(await zetStatusActie(taak.id, taak.versie, s)));
  }

  function verwijder() {
    if (!taak || !confirm(`"${taak.titel}" verwijderen?`)) return;
    start(async () => afronden(await verwijderTaakActie(taak.id)));
  }

  function stopDeReeks() {
    const herhalingId = taak?.herhalingId;
    if (!herhalingId || !confirm('De reeks stoppen? Toekomstige open taken van deze reeks worden verwijderd.')) return;
    start(async () => afronden(await stopReeksActie(herhalingId)));
  }

  function laadHistorie() {
    if (!taak || historie) return;
    start(async () => {
      const r = await historieActie(taak.id);
      if (r.ok) setHistorie(r.data);
      else setFout({ tekst: r.fout, conflict: false });
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onSluit(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={taak ? 'Taak bewerken' : 'Nieuwe taak'}
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-rand bg-paneel p-5 shadow-2xl sm:max-w-lg sm:rounded-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{taak ? 'Taak bewerken' : 'Nieuwe taak'}</h2>
          <button type="button" onClick={onSluit} aria-label="Sluiten" className="rounded-lg p-1.5 text-tekst-zacht hover:bg-kaart hover:text-tekst">
            <KruisIcoon />
          </button>
        </div>

        {taak && isBeheerder && (
          <div className="mb-5">
            <span className="mb-1.5 block text-xs font-medium text-tekst-zacht">Status</span>
            <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Status">
              {STATUSSEN.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={bezig}
                  aria-pressed={taak.status === s}
                  onClick={() => kiesStatus(s)}
                  className={cn(
                    'h-10 rounded-lg border text-sm font-semibold transition-colors',
                    taak.status === s ? cn('border-transparent', STATUS_PIL[s]) : 'border-rand text-tekst-zacht hover:bg-kaart',
                  )}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
        )}

        {isReeks && (
          <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-achtergrond p-1" role="radiogroup" aria-label="Wat wil je bewerken?">
            {(['deze', 'reeks'] as const).map((b) => (
              <button
                key={b}
                type="button"
                role="radio"
                aria-checked={bereik === b}
                onClick={() => setBereik(b)}
                className={cn('h-8 rounded-md text-sm', bereik === b ? 'bg-kaart font-semibold text-tekst' : 'text-tekst-zacht')}
              >
                {b === 'deze' ? 'Alleen deze taak' : 'Hele reeks'}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={opslaan} className="space-y-4">
          <Veld label="Titel">
            <Invoer ref={titelRef} value={titel} onChange={(e) => setTitel(e.target.value)} required maxLength={200} />
          </Veld>
          <Veld label="Omschrijving (optioneel)">
            <Tekstvak value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} rows={3} maxLength={2000} />
          </Veld>
          <div className="grid grid-cols-2 gap-3">
            <Veld label="Dag">
              <Invoer type="date" value={datum} onChange={(e) => setDatum(e.target.value)} required disabled={reeksBewerken} />
            </Veld>
            <Veld label="Tijd (optioneel)">
              <Invoer type="time" value={tijd} onChange={(e) => setTijd(e.target.value)} />
            </Veld>
          </div>
          <div>
            <span className="mb-1.5 block text-xs font-medium text-tekst-zacht">Prioriteit</span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Prioriteit">
              {[...PRIORITEITEN].reverse().map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={prioriteit === p}
                  onClick={() => setPrioriteit(p)}
                  className={cn(
                    'h-8 rounded-full border px-3 text-xs font-medium transition-colors',
                    prioriteit === p ? cn(PRIO_KNOP_AAN[p], 'text-tekst') : 'border-rand text-tekst-zacht hover:bg-kaart',
                  )}
                >
                  {PRIORITEIT_LABEL[p]}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <Veld label="Herhalen">
              <Keuzelijst value={herhalen} onChange={(e) => setHerhalen(e.target.value as Herhalen)} disabled={!herhalingBewerkbaar}>
                <option value="geen">Niet herhalen</option>
                {(Object.keys(HERHALING_LABELS) as HerhalingType[]).map((h) => (
                  <option key={h} value={h}>{HERHALING_LABELS[h]}</option>
                ))}
              </Keuzelijst>
            </Veld>
            {herhalingBewerkbaar && herhalen === 'weekdagen' && (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Weekdagen">
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={weekdagen.includes(d)}
                    onClick={() => setWeekdagen((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d].sort((a, b) => a - b)))}
                    className={cn(
                      'h-8 w-10 rounded-lg border text-xs',
                      weekdagen.includes(d) ? 'border-accent bg-accent/15 text-tekst' : 'border-rand text-tekst-zacht',
                    )}
                  >
                    {DAGNAMEN_KORT[d]}
                  </button>
                ))}
              </div>
            )}
            {herhalingBewerkbaar && herhalen === 'elke_x_weken' && (
              <Veld label="Om de hoeveel weken?">
                <Invoer type="number" min={2} max={52} value={intervalWeken} onChange={(e) => setIntervalWeken(Number(e.target.value))} className="w-24" />
              </Veld>
            )}
          </div>

          {fout && (
            <Melding>
              {fout.tekst}
              {fout.conflict && (
                <>
                  {' '}
                  <button type="button" className="underline" onClick={() => { onSluit(); router.refresh(); }}>Herladen</button>
                </>
              )}
            </Melding>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-2">
            {taak && <Knop variant="gevaar" onClick={verwijder} disabled={bezig}>Verwijderen</Knop>}
            {isReeks && <Knop variant="stil" onClick={stopDeReeks} disabled={bezig}>Reeks stoppen</Knop>}
            <div className="ml-auto flex gap-2">
              <Knop variant="secundair" onClick={onSluit}>Annuleren</Knop>
              <Knop type="submit" disabled={bezig}>{bezig ? 'Bezig…' : 'Opslaan'}</Knop>
            </div>
          </div>
        </form>

        {taak && (
          <div className="mt-5 border-t border-rand-zacht pt-4 text-xs text-tekst-flauw">
            <p>Aangemaakt door {taak.aangemaaktDoorNaam ?? 'onbekend'} · {formatMoment(new Date(taak.aangemaaktOp))}</p>
            <p>Laatst gewijzigd door {taak.gewijzigdDoorNaam ?? 'systeem'} · {formatMoment(new Date(taak.gewijzigdOp))}</p>
            <details className="mt-2" onToggle={(e) => { if (e.currentTarget.open) laadHistorie(); }}>
              <summary className="cursor-pointer text-tekst-zacht hover:text-tekst">Geschiedenis</summary>
              {historie === null ? (
                <p className="mt-2">Laden…</p>
              ) : historie.length === 0 ? (
                <p className="mt-2">Nog geen wijzigingen.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {historie.map((h, i) => (
                    <li key={i}>
                      <span className="text-tekst-zacht">{formatMoment(new Date(h.tijdstip))} · {h.naam ?? 'onbekend'}:</span>{' '}
                      {Object.entries(h.wijzigingen)
                        .map(([veld, w]) => `${VELDNAAM[veld] ?? veld} ${toon(w.oud)} → ${toon(w.nieuw)}`)
                        .join(', ')}
                    </li>
                  ))}
                </ul>
              )}
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
