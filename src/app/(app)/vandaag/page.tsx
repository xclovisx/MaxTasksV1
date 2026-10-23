import { AfwezigheidBalken } from '@/components/afwezigheid/afwezigheid-balken';
import { DagNavigatie } from '@/components/bord/dag-navigatie';
import { LiveVernieuwen } from '@/components/bord/live-vernieuwen';
import { VandaagLijst } from '@/components/bord/vandaag-lijst';
import { afwezighedenInPeriode } from '@/lib/diensten/afwezigheden';
import { takenOpDatum } from '@/lib/diensten/taken';
import { DAGNAMEN, isGeldigeDatum, kortDatumLabel, plusDagen, vandaagInAmsterdam, weekdag } from '@/lib/domein/datums';
import { vereisBeheerderSessie } from '@/lib/web/huidige-gebruiker';

function relatieveNaam(datum: string, vandaag: string): string | null {
  if (datum === vandaag) return 'Vandaag';
  if (datum === plusDagen(vandaag, -1)) return 'Gisteren';
  if (datum === plusDagen(vandaag, 1)) return 'Morgen';
  return null;
}

export default async function VandaagPagina({ searchParams }: { searchParams: Promise<{ datum?: string }> }) {
  await vereisBeheerderSessie();
  const vandaag = vandaagInAmsterdam();
  const { datum: gevraagd } = await searchParams;
  const datum = gevraagd && isGeldigeDatum(gevraagd) ? gevraagd : vandaag;
  const [taken, afwezigheid] = await Promise.all([takenOpDatum(datum), afwezighedenInPeriode(datum, datum)]);
  const open = taken.filter((t) => t.status !== 'klaar').length;
  const relatief = relatieveNaam(datum, vandaag);
  const jaar = datum.slice(0, 4) !== vandaag.slice(0, 4) ? ` ${datum.slice(0, 4)}` : '';

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">
            {relatief && <span className="text-accent">{relatief} · </span>}
            <span className="capitalize">{DAGNAMEN[weekdag(datum)]}</span> {kortDatumLabel(datum)}{jaar}
          </h1>
          <p className="text-sm text-tekst-zacht">{open} open {open === 1 ? 'taak' : 'taken'} op alle borden</p>
        </div>
        <DagNavigatie datum={datum} vandaag={vandaag} />
      </div>
      <AfwezigheidBalken naam={afwezigheid.naam} blokken={afwezigheid.perDag[datum] ?? []} />
      <VandaagLijst key={datum} taken={taken} legeTekst={datum === vandaag ? 'Geen taken voor vandaag.' : 'Geen taken op deze dag.'} />
      <LiveVernieuwen bron="/api/borden/alle/gebeurtenissen" />
    </div>
  );
}
