'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { verwijderLocatieActie } from '@/app/(app)/locaties/acties';
import { Knop } from '@/components/ui';

export function VerwijderLocatie({ id, naam }: { id: string; naam: string }) {
  const router = useRouter();
  const [bezig, start] = useTransition();
  return (
    <Knop
      variant="gevaar"
      disabled={bezig}
      onClick={() => {
        if (!confirm(`${naam} verwijderen? Bestaande taken houden hun adres.`)) return;
        start(async () => {
          const r = await verwijderLocatieActie(id);
          if (!r.ok) alert(r.fout);
          router.refresh();
        });
      }}
    >
      Verwijderen
    </Knop>
  );
}
