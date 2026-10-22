'use client';

import { useDraggable, useDroppable } from '@dnd-kit/core';
import { PlusIcoon } from '@/components/iconen';
import { cn } from '@/lib/cn';
import type { Taak } from '@/lib/diensten/taken';
import { DAGNAMEN, type Datum, kortDatumLabel, weekdag } from '@/lib/domein/datums';
import { TaakKaartInhoud } from './taak-kaart';

function SleepbareKaart({ taak, onOpen }: { taak: Taak; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: taak.id, data: { taak } });
  return (
    <button
      ref={setNodeRef}
      type="button"
      data-taak={taak.id}
      onClick={onOpen}
      {...listeners}
      {...attributes}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={cn(
        'block w-full rounded-lg text-left focus-visible:outline-2 focus-visible:outline-accent',
        isDragging && 'relative z-20 cursor-grabbing shadow-2xl shadow-black/50',
      )}
    >
      <TaakKaartInhoud taak={taak} />
    </button>
  );
}

export function DagKolom({
  datum,
  taken,
  isVandaag,
  verborgenOpMobiel,
  onNieuw,
  onOpen,
}: {
  datum: Datum;
  taken: Taak[];
  isVandaag: boolean;
  verborgenOpMobiel: boolean;
  onNieuw: () => void;
  onOpen: (taak: Taak) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: datum });
  const dagnaam = DAGNAMEN[weekdag(datum)];
  return (
    <section
      ref={setNodeRef}
      data-dag={datum}
      aria-label={`${dagnaam} ${kortDatumLabel(datum)}`}
      className={cn(
        'min-h-72 flex-col rounded-xl border p-2 transition-colors',
        verborgenOpMobiel ? 'hidden md:flex' : 'flex',
        isVandaag ? 'border-accent/50 bg-paneel' : 'border-rand-zacht bg-paneel/60',
        isOver && 'border-prio-middel/70 bg-kaart/60',
      )}
    >
      <header className="mb-2 flex items-baseline justify-between px-1.5 pt-1">
        <h2 className={cn('text-sm font-semibold capitalize', isVandaag && 'text-accent')}>{dagnaam}</h2>
        <span className="text-xs text-tekst-flauw">{isVandaag ? 'vandaag' : kortDatumLabel(datum)}</span>
      </header>
      <ul className="flex flex-1 flex-col gap-2">
        {taken.map((t) => (
          <li key={t.id}><SleepbareKaart taak={t} onOpen={() => onOpen(t)} /></li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onNieuw}
        aria-label={`Taak toevoegen op ${dagnaam}`}
        className="mt-2 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm text-tekst-flauw transition-colors hover:bg-kaart hover:text-tekst"
      >
        <PlusIcoon />Taak
      </button>
    </section>
  );
}
