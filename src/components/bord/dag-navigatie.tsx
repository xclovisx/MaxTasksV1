'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PijlLinks, PijlRechts } from '@/components/iconen';
import { cn } from '@/lib/cn';
import { type Datum, isGeldigeDatum, plusDagen } from '@/lib/domein/datums';

const KNOP =
  'inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-rand bg-kaart text-tekst-zacht transition-colors hover:bg-kaart-hover hover:text-tekst';

const naar = (d: Datum) => `/vandaag?datum=${d}`;

export function DagNavigatie({ datum, vandaag }: { datum: Datum; vandaag: Datum }) {
  const router = useRouter();
  return (
    <nav className="flex flex-wrap items-center gap-1" aria-label="Dagnavigatie">
      <Link href={naar(plusDagen(datum, -1))} className={KNOP} aria-label="Vorige dag"><PijlLinks /></Link>
      <input
        type="date"
        aria-label="Kies een datum"
        value={datum}
        onChange={(e) => {
          if (isGeldigeDatum(e.target.value)) router.push(naar(e.target.value));
        }}
        className="h-9 rounded-lg border border-rand bg-kaart px-2 text-sm text-tekst focus:border-accent focus:outline-none"
      />
      <Link href={naar(plusDagen(datum, 1))} className={KNOP} aria-label="Volgende dag"><PijlRechts /></Link>
      <Link
        href="/vandaag"
        aria-current={datum === vandaag ? 'date' : undefined}
        className={cn(KNOP, 'px-3 text-sm', datum === vandaag && 'pointer-events-none opacity-50')}
      >
        Vandaag
      </Link>
    </nav>
  );
}
