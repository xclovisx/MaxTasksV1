'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState, useTransition } from 'react';
import { maakAfwezigheidActie, wijzigAfwezigheidActie } from '@/app/(app)/beschikbaarheid/acties';
import { Invoer, Keuzelijst, Knop, Melding, Veld } from '@/components/ui';
import { cn } from '@/lib/cn';
import { type Afwezigheid, HERHALING_LABELS_AFWEZIG } from '@/lib/domein/afwezigheid';
import { DAGNAMEN, DAGNAMEN_KORT, type Datum, weekdag } from '@/lib/domein/datums';
import type { HerhalingType } from '@/lib/domein/herhaling';

type Herhalen = 'geen' | HerhalingType;

/** Zonder `begin` voegt het formulier een blok toe; met `begin` wijzigt het dat blok. */
export function AfwezigheidFormulier({
  begin,
  standaardDatum,
  onKlaar,
}: {
  begin: Afwezigheid | null;
  standaardDatum: Datum;
  onKlaar?: () => void;
}) {
  const router = useRouter();
  const [begindatum, setBegindatum] = useState<Datum>(begin?.begindatum ?? standaardDatum);
  const [einddatum, setEinddatum] = useState(begin?.einddatum ?? '');
  const [heleDag, setHeleDag] = useState(begin?.heleDag ?? true);
  const [van, setVan] = useState(begin?.van ?? '');
  const [tot, setTot] = useState(begin?.tot ?? '');
  const [reden, setReden] = useState(begin?.reden ?? '');
  const [herhalen, setHerhalen] = useState<Herhalen>(begin?.herhalingType ?? 'geen');
  const [weekdagen, setWeekdagen] = useState<number[]>(
    begin?.weekdagen.length ? begin.weekdagen : [weekdag(begin?.begindatum ?? standaardDatum)],
  );
  const [intervalWeken, setIntervalWeken] = useState(Math.max(2, begin?.intervalWeken ?? 2));
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, start] = useTransition();

  function opslaan(e: FormEvent) {
    e.preventDefault();
    setFout(null);
    const invoer = {
      begindatum,
      einddatum: einddatum || null,
      heleDag,
      van: heleDag ? null : van || null,
      tot: heleDag ? null : tot || null,
      reden,
      herhaling: herhalen === 'geen'
        ? null
        : {
          type: herhalen,
          weekdagen: herhalen === 'weekdagen' ? weekdagen : [],
          intervalWeken: herhalen === 'elke_x_weken' ? intervalWeken : 1,
        },
    };
    start(async () => {
      const r = begin ? await wijzigAfwezigheidActie(begin.id, invoer) : await maakAfwezigheidActie(invoer);
      if (!r.ok) {
        setFout(r.fout);
        return;
      }
      if (!begin) {
        setEinddatum('');
        setHeleDag(true);
        setVan('');
        setTot('');
        setReden('');
        setHerhalen('geen');
      }
      onKlaar?.();
      router.refresh();
    });
  }

  return (
    <form onSubmit={opslaan} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Veld label="Begindatum">
          <Invoer type="date" value={begindatum} onChange={(e) => setBegindatum(e.target.value)} required />
        </Veld>
        <Veld label="Einddatum (optioneel)" hint={herhalen === 'geen' ? 'Leeg: alleen de begindatum' : 'Leeg: blijft doorgaan'}>
          <Invoer type="date" value={einddatum} min={begindatum} onChange={(e) => setEinddatum(e.target.value)} />
        </Veld>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={heleDag} onChange={(e) => setHeleDag(e.target.checked)} className="size-4 accent-accent" />
        Hele dag
      </label>
      {!heleDag && (
        <div className="grid grid-cols-2 gap-3">
          <Veld label="Van"><Invoer type="time" value={van} onChange={(e) => setVan(e.target.value)} required /></Veld>
          <Veld label="Tot"><Invoer type="time" value={tot} onChange={(e) => setTot(e.target.value)} required /></Veld>
        </div>
      )}
      <Veld label="Reden (optioneel)" hint="Zichtbaar voor iedereen">
        <Invoer value={reden} onChange={(e) => setReden(e.target.value)} maxLength={100} />
      </Veld>
      <Veld label="Herhalen">
        <Keuzelijst value={herhalen} onChange={(e) => setHerhalen(e.target.value as Herhalen)}>
          <option value="geen">Niet herhalen</option>
          {(Object.keys(HERHALING_LABELS_AFWEZIG) as HerhalingType[]).map((h) => (
            <option key={h} value={h}>{HERHALING_LABELS_AFWEZIG[h]}</option>
          ))}
        </Keuzelijst>
      </Veld>
      {herhalen === 'weekdagen' && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Weekdagen">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={weekdagen.includes(d)}
              aria-label={DAGNAMEN[d]}
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
      {herhalen === 'elke_x_weken' && (
        <Veld label="Om de hoeveel weken?">
          <Invoer type="number" min={2} max={52} value={intervalWeken} onChange={(e) => setIntervalWeken(Number(e.target.value))} className="w-24" />
        </Veld>
      )}
      {fout && <Melding>{fout}</Melding>}
      <div className="flex gap-2">
        <Knop type="submit" disabled={bezig}>{bezig ? 'Bezig…' : begin ? 'Opslaan' : 'Blok toevoegen'}</Knop>
        {onKlaar && <Knop variant="secundair" onClick={onKlaar}>Annuleren</Knop>}
      </div>
    </form>
  );
}
