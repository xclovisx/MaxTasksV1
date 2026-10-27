'use client';

import { type TouchEvent, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { KruisIcoon, PijlLinks, PijlRechts } from '@/components/iconen';
import { type Bijlage, isQr } from '@/lib/domein/bijlagen';

const VEEG_PX = 50;

/** Toont foto's schermvullend boven het taakvenster; bladeren met pijlen, toetsen of vegen. */
export function FotoWeergave({ fotos, begin, onSluit }: { fotos: Bijlage[]; begin: number; onSluit: () => void }) {
  const [index, setIndex] = useState(begin);
  const [toonFoto, setToonFoto] = useState(false);
  const [codeKapot, setCodeKapot] = useState(false);
  const veegStart = useRef<number | null>(null);
  const meer = fotos.length > 1;
  const foto = fotos[Math.min(index, fotos.length - 1)];
  const url = `/api/bijlagen/${foto.id}`;
  const metCode = foto.code !== null && !codeKapot;
  const toonCode = metCode && !toonFoto;
  const blader = (stap: number) => {
    setIndex((i) => (i + stap + fotos.length) % fotos.length);
    setToonFoto(false);
    setCodeKapot(false);
  };

  const sluitRef = useRef(onSluit);
  const bladerRef = useRef(blader);
  useEffect(() => {
    sluitRef.current = onSluit;
    bladerRef.current = blader;
  });

  useEffect(() => {
    // In de capture-fase en zonder doorgeven: Esc mag alleen de foto sluiten, niet ook het taakvenster eronder.
    const bijToets = (e: KeyboardEvent) => {
      if (e.key === 'Escape') sluitRef.current();
      else if (e.key === 'ArrowLeft') bladerRef.current(-1);
      else if (e.key === 'ArrowRight') bladerRef.current(1);
      else return;
      e.stopPropagation();
      e.preventDefault();
    };
    window.addEventListener('keydown', bijToets, { capture: true });
    return () => window.removeEventListener('keydown', bijToets, { capture: true });
  }, []);

  function veegEind(e: TouchEvent) {
    if (veegStart.current === null || !meer) return;
    const dx = e.changedTouches[0].clientX - veegStart.current;
    veegStart.current = null;
    if (Math.abs(dx) >= VEEG_PX) blader(dx < 0 ? 1 : -1);
  }

  const knop = 'rounded-full bg-black/60 p-2.5 text-white hover:bg-black/80';
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Foto bekijken"
      className="fixed inset-0 z-[60] flex flex-col bg-black/90"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onSluit(); }}
      onTouchStart={(e) => { veegStart.current = e.touches[0].clientX; }}
      onTouchEnd={veegEind}
    >
      <div className="flex items-center justify-between gap-2 p-3 text-sm text-white">
        <span className="min-w-0 truncate">{meer ? `${index + 1} / ${fotos.length}` : foto.naam}</span>
        <div className="flex shrink-0 gap-2">
          {metCode && (
            <button type="button" onClick={() => setToonFoto((t) => !t)} className="rounded-full bg-black/60 px-3 py-2 hover:bg-black/80">
              {toonFoto ? 'Code' : 'Originele foto'}
            </button>
          )}
          <a href={url} download={foto.naam} className="rounded-full bg-black/60 px-3 py-2 hover:bg-black/80">Downloaden</a>
          <button type="button" aria-label="Sluiten" onClick={onSluit} className={knop}><KruisIcoon /></button>
        </div>
      </div>
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-3 pb-3"
        onMouseDown={(e) => { if (e.target === e.currentTarget) onSluit(); }}
      >
        {toonCode && foto.code ? (
          <div className="flex max-h-full max-w-full flex-col items-center gap-3 rounded-xl bg-white p-4">
            <img
              src={`${url}/code`}
              alt={isQr(foto.code.formaat) ? 'QR-code' : 'Streepjescode'}
              onError={() => setCodeKapot(true)}
              className={isQr(foto.code.formaat) ? 'aspect-square w-[min(80vw,60dvh)]' : 'w-[min(90vw,48rem)]'}
            />
            <p className="max-w-[min(90vw,48rem)] font-mono text-sm break-all text-black select-text">{foto.code.tekst}</p>
          </div>
        ) : (
          <img src={url} alt={foto.naam} className="max-h-full max-w-full object-contain" />
        )}
        {meer && (
          <>
            <button type="button" aria-label="Vorige foto" onClick={() => blader(-1)} className={`${knop} absolute top-1/2 left-3 -translate-y-1/2`}>
              <PijlLinks />
            </button>
            <button type="button" aria-label="Volgende foto" onClick={() => blader(1)} className={`${knop} absolute top-1/2 right-3 -translate-y-1/2`}>
              <PijlRechts />
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
