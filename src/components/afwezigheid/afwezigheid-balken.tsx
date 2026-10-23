import { type Afwezigheid, balkTekst } from '@/lib/domein/afwezigheid';

export function AfwezigheidBalken({ naam, blokken }: { naam: string; blokken: Afwezigheid[] }) {
  if (blokken.length === 0) return null;
  return (
    <ul className="mb-2 space-y-1" aria-label="Niet beschikbaar">
      {blokken.map((b) => (
        <li key={b.id} className="rounded-md border border-rand-zacht bg-kaart/70 px-2 py-1 text-xs text-tekst-zacht">
          {balkTekst(naam, b)}
        </li>
      ))}
    </ul>
  );
}
