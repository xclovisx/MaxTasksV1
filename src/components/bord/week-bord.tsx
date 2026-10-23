'use client';

import { DndContext, type DragEndEvent, MouseSensor, useSensor, useSensors } from '@dnd-kit/core';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { verplaatsTaakActie } from '@/app/(app)/bord/acties';
import { PijlLinks, PijlRechts, PlusIcoon } from '@/components/iconen';
import { Knop, Melding } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { AfwezighedenOverzicht } from '@/lib/diensten/afwezigheden';
import type { Taak } from '@/lib/diensten/taken';
import { DAGNAMEN_KORT, type Datum, kortDatumLabel, weekdag } from '@/lib/domein/datums';
import { vergelijkTaken } from '@/lib/domein/taak';
import { DagKolom } from './dag-kolom';
import { type DialoogModus, TaakDialoog } from './taak-dialoog';

const WEEKKNOP =
  'inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-rand bg-kaart text-tekst-zacht transition-colors hover:bg-kaart-hover hover:text-tekst';

export type WeekBordProps = {
  bordId: string;
  dagen: Datum[];
  werkdagen: number[];
  taken: Taak[];
  afwezigheid: AfwezighedenOverzicht;
  vandaag: Datum;
  isBeheerder: boolean;
  gearchiveerd: boolean;
  weekLabel: string;
  periodeLabel: string;
  links: { vorige: string; deze: string; volgende: string };
};

export function WeekBord({ bordId, dagen, werkdagen, taken, afwezigheid, vandaag, isBeheerder, gearchiveerd, weekLabel, periodeLabel, links }: WeekBordProps) {
  const router = useRouter();
  const [dialoog, setDialoog] = useState<DialoogModus | null>(null);
  const [verplaatst, setVerplaatst] = useState<Record<string, Datum>>({});
  const [fout, setFout] = useState<string | null>(null);
  const [actieveDag, setActieveDag] = useState<Datum>(dagen.includes(vandaag) ? vandaag : dagen[0]);
  const dndId = useId();
  const sluitDialoog = useCallback(() => setDialoog(null), []);
  const zojuistGesleept = useRef(false);
  const veegStart = useRef<number | null>(null);
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }));

  // Nieuwe serverdata vervangt optimistische verplaatsingen.
  useEffect(() => setVerplaatst({}), [taken]);

  const perDag = useMemo(() => {
    const m = new Map<Datum, Taak[]>(dagen.map((d) => [d, []]));
    for (const t of taken) m.get(verplaatst[t.id] ?? t.datum)?.push(t);
    for (const lijst of m.values()) lijst.sort(vergelijkTaken);
    return m;
  }, [dagen, taken, verplaatst]);

  async function bijLoslaten(e: DragEndEvent) {
    setTimeout(() => { zojuistGesleept.current = false; }, 50);
    const taak = e.active.data.current?.taak as Taak | undefined;
    const naar = e.over?.id as Datum | undefined;
    if (!taak || !naar || naar === (verplaatst[taak.id] ?? taak.datum)) return;
    setVerplaatst((v) => ({ ...v, [taak.id]: naar }));
    const r = await verplaatsTaakActie(taak.id, taak.versie, naar);
    if (!r.ok) {
      setFout(r.fout);
      setVerplaatst((v) => {
        const kopie = { ...v };
        delete kopie[taak.id];
        return kopie;
      });
    } else {
      setFout(null);
    }
    router.refresh();
  }

  function openTaak(taak: Taak) {
    if (zojuistGesleept.current) return;
    setDialoog({ soort: 'bewerk', taak });
  }

  function nieuweTaak(datum: Datum) {
    setDialoog({ soort: 'nieuw', bordId, datum });
  }

  function veeg(eindX: number) {
    if (veegStart.current === null) return;
    const dx = eindX - veegStart.current;
    veegStart.current = null;
    if (Math.abs(dx) < 60) return;
    const i = dagen.indexOf(actieveDag) + (dx < 0 ? 1 : -1);
    if (i >= 0 && i < dagen.length) setActieveDag(dagen[i]);
  }

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-4">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <h1 className="text-lg font-semibold">{weekLabel}</h1>
          <p className="text-sm text-tekst-zacht">{periodeLabel}</p>
        </div>
        <nav className="flex items-center gap-1" aria-label="Weeknavigatie">
          <Link href={links.vorige} className={WEEKKNOP} aria-label="Vorige week"><PijlLinks /></Link>
          <Link href={links.deze} className={cn(WEEKKNOP, 'px-3 text-sm')}>Deze week</Link>
          <Link href={links.volgende} className={WEEKKNOP} aria-label="Volgende week"><PijlRechts /></Link>
        </nav>
        <Knop onClick={() => nieuweTaak(actieveDag)} disabled={gearchiveerd}>
          <PlusIcoon />Nieuwe taak
        </Knop>
      </div>

      {gearchiveerd && <div className="mb-3"><Melding soort="info">Dit bord is gearchiveerd. Nieuwe taken toevoegen kan niet.</Melding></div>}
      {fout && <div className="mb-3"><Melding>{fout}</Melding></div>}

      <div className="mb-3 flex gap-1 overflow-x-auto md:hidden" role="tablist" aria-label="Dagen">
        {dagen.map((d) => (
          <button
            key={d}
            type="button"
            role="tab"
            aria-selected={d === actieveDag}
            onClick={() => setActieveDag(d)}
            className={cn(
              'flex min-w-14 flex-col items-center rounded-lg px-2 py-1.5 text-xs',
              d === actieveDag ? 'bg-kaart text-tekst' : 'text-tekst-zacht',
              d === vandaag && 'ring-1 ring-accent/60',
            )}
          >
            <span className="font-semibold uppercase">{DAGNAMEN_KORT[weekdag(d)]}</span>
            <span>{kortDatumLabel(d)}</span>
          </button>
        ))}
      </div>

      <DndContext
        id={dndId}
        sensors={sensors}
        accessibility={{
          screenReaderInstructions: { draggable: 'Sleep met de muis naar een andere dag om de taak te verplaatsen.' },
          announcements: {
            onDragStart: () => 'Taak opgepakt.',
            onDragOver: ({ over }) => (over ? `Boven ${over.id}.` : 'Niet boven een dag.'),
            onDragEnd: ({ over }) => (over ? `Taak verplaatst naar ${over.id}.` : 'Verplaatsen geannuleerd.'),
            onDragCancel: () => 'Verplaatsen geannuleerd.',
          },
        }}
        onDragStart={() => { zojuistGesleept.current = true; }}
        onDragEnd={bijLoslaten}
        onDragCancel={() => { zojuistGesleept.current = false; }}
      >
        <div
          className="gap-3 md:grid"
          style={{ gridTemplateColumns: `repeat(${dagen.length}, minmax(0, 1fr))` }}
          onTouchStart={(e) => { veegStart.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => veeg(e.changedTouches[0].clientX)}
        >
          {dagen.map((d) => (
            <DagKolom
              key={d}
              datum={d}
              taken={perDag.get(d) ?? []}
              isVandaag={d === vandaag}
              isWerkdag={werkdagen.includes(weekdag(d))}
              verborgenOpMobiel={d !== actieveDag}
              gearchiveerd={gearchiveerd}
              afwezig={afwezigheid.perDag[d] ?? []}
              afwezigNaam={afwezigheid.naam}
              onNieuw={() => nieuweTaak(d)}
              onOpen={openTaak}
            />
          ))}
        </div>
      </DndContext>

      {dialoog && <TaakDialoog modus={dialoog} isBeheerder={isBeheerder} onSluit={sluitDialoog} />}
    </div>
  );
}
