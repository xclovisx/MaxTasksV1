import { HerhaalIcoon, KlokIcoon, PaperclipIcoon, PinIcoon } from '@/components/iconen';
import { cn } from '@/lib/cn';
import type { Taak } from '@/lib/diensten/taken';
import { stopsSamenvatting } from '@/lib/domein/navigatie';
import { PRIORITEIT_LABEL, STATUS_LABEL, taakLabels } from '@/lib/domein/taak';
import { herhalingKort, LABEL_STIJL, PRIO_STIP, STATUS_PIL } from './stijl';

export function TaakKaartInhoud({ taak, toonBord = false }: { taak: Taak; toonBord?: boolean }) {
  const klaar = taak.status === 'klaar';
  const herhaling = herhalingKort(taak);
  const labels = taakLabels(taak);
  const plek = stopsSamenvatting(taak.stops);
  const heeftMeta = Boolean(taak.tijd || plek || herhaling || taak.status !== 'open' || labels.length || taak.bijlagen.length > 0);
  return (
    <div
      className={cn(
        'rounded-lg border bg-kaart px-3 py-2.5 transition-colors hover:bg-kaart-hover',
        taak.prioriteit === 'nu' && !klaar ? 'border-prio-nu/60' : 'border-rand',
        klaar && 'opacity-55',
      )}
    >
      {toonBord && (
        <p className="mb-1 truncate text-[11px] font-medium tracking-wide text-tekst-flauw uppercase">
          {taak.bordNaam}
        </p>
      )}
      <div className="flex items-start gap-2">
        {taak.prioriteit === 'nu' ? (
          <span className="mt-px shrink-0 rounded bg-prio-nu px-1.5 text-[10px] leading-4 font-bold tracking-wide text-white">NU</span>
        ) : (
          <span
            className={cn('mt-1.5 size-2 shrink-0 rounded-full', PRIO_STIP[taak.prioriteit])}
            title={`Prioriteit: ${PRIORITEIT_LABEL[taak.prioriteit]}`}
          />
        )}
        <span className={cn('min-w-0 text-sm leading-snug font-medium break-words', klaar && 'line-through')}>{taak.titel}</span>
      </div>
      {heeftMeta && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-tekst-zacht">
          {taak.tijd && <span className="inline-flex items-center gap-1"><KlokIcoon />{taak.tijd}</span>}
          {plek && <span className="inline-flex min-w-0 items-center gap-1"><PinIcoon /><span className="truncate">{plek}</span></span>}
          {herhaling && <span className="inline-flex items-center gap-1"><HerhaalIcoon />{herhaling}</span>}
          {taak.bijlagen.length > 0 && (
            <span className="inline-flex items-center gap-1" title="Bijlagen"><PaperclipIcoon />{taak.bijlagen.length}</span>
          )}
          {taak.status !== 'open' && (
            <span className={cn('rounded px-1.5 py-px font-semibold', STATUS_PIL[taak.status])}>{STATUS_LABEL[taak.status]}</span>
          )}
          {labels.map((l) => (
            <span key={l.soort} className={cn('rounded px-1.5 py-px', LABEL_STIJL[l.soort])}>{l.tekst}</span>
          ))}
        </div>
      )}
    </div>
  );
}
