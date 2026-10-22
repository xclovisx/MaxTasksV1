'use client';

import { useRouter } from 'next/navigation';
import { type ReactNode, useRef, useState, useTransition } from 'react';
import type { ActieResultaat } from '@/lib/web/actie';
import { Knop, Melding } from './ui';

export function ActieFormulier<T>({
  actie,
  knop,
  children,
  bijSucces,
  wisNaSucces = true,
  knopVariant = 'primair',
}: {
  actie: (formulier: FormData) => Promise<ActieResultaat<T>>;
  knop: string;
  children: ReactNode;
  bijSucces?: (data: T) => void;
  wisNaSucces?: boolean;
  knopVariant?: 'primair' | 'secundair';
}) {
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [gelukt, setGelukt] = useState(false);
  const [bezig, start] = useTransition();

  return (
    <form
      ref={ref}
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const gegevens = new FormData(e.currentTarget);
        setGelukt(false);
        start(async () => {
          const r = await actie(gegevens);
          if (!r.ok) {
            setFout(r.fout);
            return;
          }
          setFout(null);
          if (wisNaSucces) ref.current?.reset();
          else setGelukt(true);
          bijSucces?.(r.data);
          router.refresh();
        });
      }}
    >
      {children}
      {fout && <Melding>{fout}</Melding>}
      <div className="flex items-center gap-3">
        <Knop type="submit" variant={knopVariant} disabled={bezig}>{bezig ? 'Bezig…' : knop}</Knop>
        {gelukt && <span role="status" className="text-xs text-tekst-zacht">Opgeslagen</span>}
      </div>
    </form>
  );
}
