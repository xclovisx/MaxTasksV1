import { notFound } from 'next/navigation';
import { LiveVernieuwen } from '@/components/bord/live-vernieuwen';
import { WeekBord } from '@/components/bord/week-bord';
import { afwezighedenInPeriode } from '@/lib/diensten/afwezigheden';
import { haalBord } from '@/lib/diensten/borden';
import { haalInstellingen } from '@/lib/diensten/instellingen';
import { takenVoorPeriode } from '@/lib/diensten/taken';
import {
  dagenVoorWeek, isoWeek, kortDatumLabel, maandagVan, parseWeekCode, plusDagen, vandaagInAmsterdam, weekCode,
} from '@/lib/domein/datums';
import { NietGevonden } from '@/lib/fouten';
import { vereisGebruiker } from '@/lib/web/huidige-gebruiker';

export default async function BordPagina({
  params,
  searchParams,
}: {
  params: Promise<{ bordId: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  const gebruiker = await vereisGebruiker();
  const { bordId } = await params;
  const { week } = await searchParams;

  const bord = await haalBord(bordId).catch((e: unknown) => {
    if (e instanceof NietGevonden) notFound();
    throw e;
  });
  const { werkdagen } = await haalInstellingen();

  const vandaag = vandaagInAmsterdam();
  const maandag = (week && parseWeekCode(week)) || maandagVan(vandaag);
  const taken = await takenVoorPeriode(bord.id, maandag, plusDagen(maandag, 6));
  const afwezigheid = await afwezighedenInPeriode(maandag, plusDagen(maandag, 6));
  const dagen = dagenVoorWeek(maandag, werkdagen, taken.map((t) => t.datum));

  return (
    <>
      <WeekBord
        key={maandag}
        bordId={bord.id}
        dagen={dagen}
        werkdagen={werkdagen}
        taken={taken}
        afwezigheid={afwezigheid}
        vandaag={vandaag}
        isBeheerder={gebruiker.rol === 'beheerder'}
        gearchiveerd={bord.gearchiveerd}
        weekLabel={`Week ${isoWeek(maandag).week} · ${bord.naam}`}
        periodeLabel={`${kortDatumLabel(dagen[0])} – ${kortDatumLabel(dagen[dagen.length - 1])} ${maandag.slice(0, 4)}`}
        links={{
          vorige: `/bord/${bord.id}?week=${weekCode(plusDagen(maandag, -7))}`,
          deze: `/bord/${bord.id}`,
          volgende: `/bord/${bord.id}?week=${weekCode(plusDagen(maandag, 7))}`,
        }}
      />
      <LiveVernieuwen bron={`/api/borden/${bord.id}/gebeurtenissen`} />
    </>
  );
}
