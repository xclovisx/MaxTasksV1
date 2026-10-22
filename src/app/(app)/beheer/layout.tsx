import type { ReactNode } from 'react';
import { BeheerNav } from '@/components/beheer/beheer-nav';
import { vereisBeheerderSessie } from '@/lib/web/huidige-gebruiker';

export default async function BeheerLayout({ children }: { children: ReactNode }) {
  await vereisBeheerderSessie();
  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-xl font-semibold">Beheer</h1>
      <BeheerNav />
      <div className="mt-6">{children}</div>
    </div>
  );
}
