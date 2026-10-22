import { maakBordActie, wijzigBordActie } from '../acties';
import { ActieFormulier } from '@/components/actie-formulier';
import { Invoer, Paneel, Veld } from '@/components/ui';
import { lijstBorden } from '@/lib/diensten/borden';
import { vereisBeheerderSessie } from '@/lib/web/huidige-gebruiker';

export default async function BordenPagina() {
  await vereisBeheerderSessie();
  const borden = await lijstBorden({ metGearchiveerd: true });
  return (
    <div className="space-y-4">
      <Paneel titel="Nieuw bord">
        <ActieFormulier actie={maakBordActie} knop="Bord toevoegen">
          <div className="max-w-sm">
            <Veld label="Naam"><Invoer name="naam" required maxLength={60} /></Veld>
          </div>
        </ActieFormulier>
      </Paneel>
      {borden.map((b) => (
        <Paneel key={b.id} titel={b.naam}>
          <ActieFormulier actie={wijzigBordActie.bind(null, b.id)} knop="Opslaan" knopVariant="secundair" wisNaSucces={false}>
            <div className="flex flex-wrap items-end gap-4">
              <div className="min-w-56 flex-1"><Veld label="Naam"><Invoer name="naam" defaultValue={b.naam} required maxLength={60} /></Veld></div>
              <label className="flex h-9 items-center gap-2 text-sm text-tekst-zacht">
                <input type="checkbox" name="gearchiveerd" defaultChecked={b.gearchiveerd} className="size-4 accent-accent" />
                Gearchiveerd
              </label>
            </div>
          </ActieFormulier>
        </Paneel>
      ))}
    </div>
  );
}
