import type { ReactNode } from 'react';
import { TopBalk } from '@/components/schil/top-balk';
import { lijstBorden } from '@/lib/diensten/borden';
import { haalInstellingen } from '@/lib/diensten/instellingen';
import { vereisGebruiker } from '@/lib/web/huidige-gebruiker';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const gebruiker = await vereisGebruiker();
  const [instellingen, borden] = await Promise.all([haalInstellingen(), lijstBorden()]);
  return (
    <div className="min-h-dvh">
      <TopBalk
        gebruiker={gebruiker}
        garageNaam={instellingen.naam}
        borden={borden.map((b) => ({ id: b.id, naam: b.naam }))}
      />
      {children}
    </div>
  );
}
