import { hernoemLocatieActie } from './acties';
import { ActieFormulier } from '@/components/actie-formulier';
import { NieuweLocatie } from '@/components/locaties/nieuwe-locatie';
import { VerwijderLocatie } from '@/components/locaties/verwijder-locatie';
import { Invoer, Paneel, Veld } from '@/components/ui';
import { lijstLocaties } from '@/lib/diensten/locaties';
import { vereisGebruiker } from '@/lib/web/huidige-gebruiker';

export default async function LocatiesPagina() {
  await vereisGebruiker();
  const locaties = await lijstLocaties();
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold">Locaties</h1>
        <p className="text-sm text-tekst-zacht">Vaste adressen die je met één klik aan een taak koppelt.</p>
      </div>
      <Paneel titel="Nieuwe locatie">
        <NieuweLocatie opgeslagen={locaties} />
      </Paneel>
      <Paneel titel="Opgeslagen locaties">
        {locaties.length === 0 ? (
          <p className="text-sm text-tekst-zacht">Nog geen opgeslagen locaties.</p>
        ) : (
          <ul className="divide-y divide-rand-zacht">
            {locaties.map((l) => (
              <li key={l.id} className="flex flex-wrap items-end gap-3 py-3">
                <div className="min-w-56 flex-1">
                  <ActieFormulier actie={hernoemLocatieActie.bind(null, l.id)} knop="Opslaan" knopVariant="secundair" wisNaSucces={false}>
                    <Veld label="Naam"><Invoer name="naam" defaultValue={l.naam} required maxLength={100} /></Veld>
                  </ActieFormulier>
                  <p className="mt-1 text-xs text-tekst-flauw">{l.adres} · {l.gebruikTeller}× gebruikt</p>
                </div>
                <VerwijderLocatie id={l.id} naam={l.naam} />
              </li>
            ))}
          </ul>
        )}
      </Paneel>
    </div>
  );
}
