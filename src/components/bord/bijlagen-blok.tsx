'use client';

import { useRouter } from 'next/navigation';
import { type Ref, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { verwijderBijlageActie } from '@/app/(app)/bord/acties';
import { BestandIcoon, KruisIcoon, PaperclipIcoon } from '@/components/iconen';
import { Melding } from '@/components/ui';
import { type Bijlage, formatGrootte, MAX_BIJLAGEN_PER_TAAK } from '@/lib/domein/bijlagen';
import { bereidVoor, uploadBijlage } from '@/lib/web/bijlage-upload';

type Lokaal = {
  soort: 'lokaal';
  sleutel: number;
  naam: string;
  bestand: Blob | null;
  status: 'wacht' | 'bezig' | 'fout';
  voortgang: number;
  fout: string | null;
};
type Item = { soort: 'opgeslagen'; bijlage: Bijlage } | Lokaal;

export type BijlagenHandvat = {
  /** Bereidt bestanden voor; bij een bestaande taak worden ze meteen geüpload. */
  voegToe: (bestanden: File[]) => void;
  /** Uploadt alles wat nog wacht naar de (net aangemaakte) taak; false als iets mislukte. */
  uploadAlles: (taakId: string) => Promise<boolean>;
};

export function BijlagenBlok({ taakId, begin, handvat }: { taakId: string | null; begin: Bijlage[]; handvat?: Ref<BijlagenHandvat | null> }) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>(() => begin.map((bijlage) => ({ soort: 'opgeslagen', bijlage })));
  const [fout, setFout] = useState<string | null>(null);
  // Async code leest de lijst via deze ref; hij wordt tegelijk met de state bijgewerkt.
  const itemsRef = useRef(items);
  const taakIdRef = useRef(taakId);
  const voorbereiding = useRef<Promise<void>>(Promise.resolve());
  const teller = useRef(0);
  useEffect(() => { taakIdRef.current = taakId; }, [taakId]);

  function zet(wijzig: (lijst: Item[]) => Item[]) {
    itemsRef.current = wijzig(itemsRef.current);
    setItems(itemsRef.current);
  }
  const werkBij = (sleutel: number, w: Partial<Lokaal>) =>
    zet((l) => l.map((i) => (i.soort === 'lokaal' && i.sleutel === sleutel ? { ...i, ...w } : i)));

  async function upload(item: Lokaal, naarTaak: string): Promise<boolean> {
    if (!item.bestand) return true; // al afgekeurd en gemeld; telt niet als mislukte upload
    werkBij(item.sleutel, { status: 'bezig', voortgang: 0, fout: null });
    const r = await uploadBijlage(naarTaak, item.bestand, item.naam, (v) => werkBij(item.sleutel, { voortgang: v }));
    if (!r.ok) {
      werkBij(item.sleutel, { status: 'fout', fout: r.fout });
      return false;
    }
    zet((l) => l.map((i) => (i.soort === 'lokaal' && i.sleutel === item.sleutel ? { soort: 'opgeslagen', bijlage: r.bijlage } : i)));
    router.refresh();
    return true;
  }

  function voegToe(bestanden: File[]) {
    voorbereiding.current = voorbereiding.current.then(async () => {
      for (const f of bestanden) {
        const bezet = itemsRef.current.filter((i) => i.soort === 'opgeslagen' || i.bestand !== null).length;
        const v = bezet >= MAX_BIJLAGEN_PER_TAAK ? { fout: `Maximaal ${MAX_BIJLAGEN_PER_TAAK} bijlagen per taak.` } : await bereidVoor(f);
        const item: Lokaal = 'fout' in v
          ? { soort: 'lokaal', sleutel: ++teller.current, naam: f.name || 'bijlage', bestand: null, status: 'fout', voortgang: 0, fout: v.fout }
          : { soort: 'lokaal', sleutel: ++teller.current, naam: v.naam, bestand: v.bestand, status: 'wacht', voortgang: 0, fout: null };
        zet((l) => [...l, item]);
        if (taakIdRef.current && item.bestand) await upload(item, taakIdRef.current);
      }
    });
  }

  async function uploadAlles(id: string): Promise<boolean> {
    taakIdRef.current = id;
    await voorbereiding.current;
    let alles = true;
    for (const i of itemsRef.current) {
      if (i.soort === 'lokaal' && i.status !== 'bezig' && !(await upload(i, id))) alles = false;
    }
    return alles;
  }

  useImperativeHandle(handvat, () => ({ voegToe, uploadAlles }));

  async function verwijder(b: Bijlage) {
    if (!confirm('Bijlage verwijderen?')) return;
    const r = await verwijderBijlageActie(b.id);
    if (!r.ok) return setFout(r.fout);
    setFout(null);
    zet((l) => l.filter((i) => !(i.soort === 'opgeslagen' && i.bijlage.id === b.id)));
    router.refresh();
  }

  return (
    <div>
      <span className="mb-1.5 block text-xs font-medium text-tekst-zacht">Bijlagen</span>
      {items.length > 0 && (
        <ul className="mb-2 grid grid-cols-3 gap-2" aria-label="Bijlagen">
          {items.map((i) =>
            i.soort === 'opgeslagen' ? (
              <li key={i.bijlage.id} className="relative">
                <a
                  href={`/api/bijlagen/${i.bijlage.id}`}
                  target="_blank"
                  rel="noopener"
                  aria-label={i.bijlage.naam}
                  title={i.bijlage.naam}
                  className="block aspect-square overflow-hidden rounded-lg border border-rand bg-achtergrond"
                >
                  {i.bijlage.type === 'application/pdf' ? (
                    <span className="flex size-full flex-col items-center justify-center gap-1 p-1.5 text-center text-[11px] text-tekst-zacht">
                      <BestandIcoon />
                      <span className="line-clamp-2 break-all">{i.bijlage.naam}</span>
                      <span>{formatGrootte(i.bijlage.grootte)}</span>
                    </span>
                  ) : (
                    <img src={`/api/bijlagen/${i.bijlage.id}`} alt="" loading="lazy" className="size-full object-cover" />
                  )}
                </a>
                <button
                  type="button"
                  aria-label={`${i.bijlage.naam} verwijderen`}
                  onClick={() => void verwijder(i.bijlage)}
                  className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                >
                  <KruisIcoon />
                </button>
              </li>
            ) : (
              <li key={i.sleutel} className="relative flex aspect-square flex-col justify-between rounded-lg border border-rand bg-achtergrond p-1.5 text-[11px]">
                <span className="line-clamp-2 break-all text-tekst-zacht">{i.naam}</span>
                {i.status === 'fout' ? (
                  <span role="alert" className="text-prio-nu">{i.fout}</span>
                ) : (
                  <span className="h-1.5 overflow-hidden rounded-full bg-rand" aria-label={`${i.naam} wordt geüpload`}>
                    <span className="block h-full bg-accent transition-[width]" style={{ width: `${Math.round(i.voortgang * 100)}%` }} />
                  </span>
                )}
                {i.status === 'fout' && (
                  <button
                    type="button"
                    aria-label={`${i.naam} weghalen`}
                    onClick={() => zet((l) => l.filter((x) => !(x.soort === 'lokaal' && x.sleutel === i.sleutel)))}
                    className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white"
                  >
                    <KruisIcoon />
                  </button>
                )}
              </li>
            ),
          )}
        </ul>
      )}
      <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-rand px-3 text-sm text-tekst-zacht hover:bg-kaart">
        <PaperclipIcoon />
        Foto of bestand toevoegen
        <input
          type="file"
          accept="image/*,application/pdf"
          multiple
          className="sr-only"
          onChange={(e) => {
            voegToe([...(e.target.files ?? [])]);
            e.target.value = '';
          }}
        />
      </label>
      <p className="mt-1 hidden text-xs text-tekst-flauw sm:block">Of plak een screenshot met Ctrl+V, of sleep een bestand in dit venster.</p>
      {fout && <div className="mt-2"><Melding>{fout}</Melding></div>}
    </div>
  );
}
