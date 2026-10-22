import { MedewerkerActies } from '@/components/beheer/medewerker-acties';
import { NieuweMedewerker } from '@/components/beheer/nieuwe-medewerker';
import { Paneel } from '@/components/ui';
import { lijstMedewerkers, type Medewerker } from '@/lib/diensten/medewerkers';
import { formatMoment } from '@/lib/domein/datums';
import { contextVan, vereisBeheerderSessie } from '@/lib/web/huidige-gebruiker';

function statusTekst(m: Medewerker): string {
  if (!m.actief) return 'Gedeactiveerd';
  if (m.geactiveerd) return 'Actief';
  if (m.activatieVerlooptOp && m.activatieVerlooptOp > new Date()) return `Wacht op activatie (link geldig tot ${formatMoment(m.activatieVerlooptOp)})`;
  return 'Link verlopen: maak een nieuwe link';
}

export default async function MedewerkersPagina() {
  const ctx = contextVan(await vereisBeheerderSessie());
  const medewerkers = await lijstMedewerkers(ctx);
  return (
    <div className="space-y-4">
      <Paneel titel="Nieuwe medewerker">
        <NieuweMedewerker />
      </Paneel>
      <Paneel titel="Medewerkers">
        {medewerkers.length === 0 ? (
          <p className="text-sm text-tekst-zacht">Nog geen medewerkers.</p>
        ) : (
          <ul className="divide-y divide-rand-zacht">
            {medewerkers.map((m) => (
              <li key={m.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">{m.naam}</p>
                  <p className="text-xs text-tekst-zacht">@{m.gebruikersnaam} · {statusTekst(m)}</p>
                </div>
                <MedewerkerActies id={m.id} naam={m.naam} actief={m.actief} />
              </li>
            ))}
          </ul>
        )}
      </Paneel>
    </div>
  );
}
