'use client';

import { usePathname, useRouter } from 'next/navigation';

export type BordOptie = { id: string; naam: string };

export function BordKiezer({ borden }: { borden: BordOptie[] }) {
  const router = useRouter();
  const pad = usePathname();
  const huidig = pad.startsWith('/bord/') ? pad.split('/')[2] : '';
  if (borden.length === 0) return null;
  if (borden.length === 1) {
    return <span className="truncate text-sm text-tekst-zacht">{borden[0].naam}</span>;
  }
  return (
    <select
      aria-label="Bord kiezen"
      value={huidig}
      onChange={(e) => e.target.value && router.push(`/bord/${e.target.value}`)}
      className="h-9 max-w-[16rem] truncate rounded-lg border border-rand bg-kaart px-2 text-sm text-tekst"
    >
      <option value="" disabled>Kies een bord…</option>
      {borden.map((b) => <option key={b.id} value={b.id}>{b.naam}</option>)}
    </select>
  );
}
