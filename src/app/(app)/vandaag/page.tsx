import { LiveVernieuwen } from '@/components/bord/live-vernieuwen';
import { VandaagLijst } from '@/components/bord/vandaag-lijst';
import { takenOpDatum } from '@/lib/diensten/taken';
import { DAGNAMEN, kortDatumLabel, vandaagInAmsterdam, weekdag } from '@/lib/domein/datums';
import { vereisBeheerderSessie } from '@/lib/web/huidige-gebruiker';

export default async function VandaagPagina() {
  await vereisBeheerderSessie();
  const vandaag = vandaagInAmsterdam();
  const taken = await takenOpDatum(vandaag);
  const open = taken.filter((t) => t.status !== 'klaar').length;
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-5">
        <h1 className="text-xl font-semibold capitalize">{DAGNAMEN[weekdag(vandaag)]} {kortDatumLabel(vandaag)}</h1>
        <p className="text-sm text-tekst-zacht">{open} open {open === 1 ? 'taak' : 'taken'} op alle borden</p>
      </div>
      <VandaagLijst taken={taken} />
      <LiveVernieuwen bron="/api/borden/alle/gebeurtenissen" />
    </div>
  );
}
