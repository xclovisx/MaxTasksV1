import Link from 'next/link';
import { uitlogActie } from '@/app/login/acties';
import type { SessieGebruiker } from '@/lib/auth/sessies';
import { BordKiezer, type BordOptie } from './bord-kiezer';

const NAV = 'rounded-lg px-2.5 py-1.5 text-tekst-zacht transition-colors hover:bg-kaart hover:text-tekst';

export function TopBalk({
  gebruiker,
  garageNaam,
  borden,
}: {
  gebruiker: SessieGebruiker;
  garageNaam: string;
  borden: BordOptie[];
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-rand-zacht bg-achtergrond/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2 text-sm font-bold tracking-tight">
          <span className="size-2.5 rounded-sm bg-accent" />
          <span className="hidden sm:inline">{garageNaam}</span>
        </Link>
        <BordKiezer borden={borden} />
        <nav className="ml-auto flex items-center gap-1 text-sm">
          <Link href="/locaties" className={NAV}>Locaties</Link>
          {gebruiker.rol === 'beheerder' && (
            <>
              <Link href="/vandaag" className={NAV}>Vandaag</Link>
              <Link href="/beheer" className={NAV}>Beheer</Link>
            </>
          )}
          <span className="hidden px-2 text-tekst-flauw md:inline">{gebruiker.naam}</span>
          <form action={uitlogActie}>
            <button type="submit" className={NAV}>Uitloggen</button>
          </form>
        </nav>
      </div>
    </header>
  );
}
