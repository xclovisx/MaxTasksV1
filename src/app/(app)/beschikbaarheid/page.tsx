import { AfwezigheidFormulier } from '@/components/afwezigheid/afwezigheid-formulier';
import { AfwezigheidRegel } from '@/components/afwezigheid/afwezigheid-regel';
import { Paneel } from '@/components/ui';
import { lijstAfwezigheden } from '@/lib/diensten/afwezigheden';
import { vandaagInAmsterdam } from '@/lib/domein/datums';
import { vereisBeheerderSessie } from '@/lib/web/huidige-gebruiker';

export default async function BeschikbaarheidPagina() {
  await vereisBeheerderSessie();
  const blokken = await lijstAfwezigheden();
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold">Beschikbaarheid</h1>
        <p className="text-sm text-tekst-zacht">
          Geef aan wanneer je niet beschikbaar bent. Collega&apos;s zien dit op het bord en krijgen een waarschuwing bij het inplannen.
        </p>
      </div>
      <Paneel titel="Nieuw blok">
        <AfwezigheidFormulier begin={null} standaardDatum={vandaagInAmsterdam()} />
      </Paneel>
      <Paneel titel="Blokken">
        {blokken.length === 0 ? (
          <p className="text-sm text-tekst-zacht">Nog geen blokken.</p>
        ) : (
          <ul className="divide-y divide-rand-zacht">
            {blokken.map((b) => <AfwezigheidRegel key={b.id} blok={b} />)}
          </ul>
        )}
      </Paneel>
    </div>
  );
}
