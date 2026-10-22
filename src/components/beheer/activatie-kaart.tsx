'use client';

import { useId, useState } from 'react';
import { Invoer, Knop } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatMoment } from '@/lib/domein/datums';
import type { ActivatieWeergave } from '@/lib/web/actie';

function KopieerVeld({ label, waarde, groot = false }: { label: string; waarde: string; groot?: boolean }) {
  const id = useId();
  const [gekopieerd, setGekopieerd] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-tekst-zacht">{label}</label>
      <div className="flex gap-2">
        <Invoer
          id={id}
          readOnly
          value={waarde}
          onFocus={(e) => e.currentTarget.select()}
          className={cn('font-mono', groot ? 'text-lg tracking-[0.3em]' : 'text-xs')}
        />
        <Knop
          variant="secundair"
          onClick={async () => {
            await navigator.clipboard.writeText(waarde);
            setGekopieerd(true);
            setTimeout(() => setGekopieerd(false), 1500);
          }}
        >
          {gekopieerd ? 'Gekopieerd' : 'Kopieer'}
        </Knop>
      </div>
    </div>
  );
}

export function ActivatieKaart({ activatie }: { activatie: ActivatieWeergave }) {
  return (
    <div className="mt-3 space-y-3 rounded-lg border border-accent/40 bg-accent/5 p-3 text-sm">
      <p className="text-tekst-zacht">
        Stuur de link of de code naar de medewerker. Geldig tot {formatMoment(new Date(activatie.verlooptOp))}.
      </p>
      <KopieerVeld label="Activatielink" waarde={activatie.link} />
      <KopieerVeld label="Activatiecode" waarde={activatie.code} groot />
    </div>
  );
}
