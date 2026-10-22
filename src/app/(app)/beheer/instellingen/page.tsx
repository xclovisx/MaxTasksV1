import { wijzigInstellingenActie, wijzigWachtwoordActie } from '../acties';
import { ActieFormulier } from '@/components/actie-formulier';
import { GarageAdresKiezer } from '@/components/beheer/garage-adres-kiezer';
import { WerkdagenKeuze } from '@/components/beheer/werkdagen-keuze';
import { Invoer, Paneel, Veld } from '@/components/ui';
import { haalInstellingen } from '@/lib/diensten/instellingen';
import { lijstLocaties } from '@/lib/diensten/locaties';
import { vereisBeheerderSessie } from '@/lib/web/huidige-gebruiker';

export default async function InstellingenPagina() {
  await vereisBeheerderSessie();
  const [instellingen, locaties] = await Promise.all([haalInstellingen(), lijstLocaties()]);
  return (
    <div className="space-y-4">
      <Paneel titel="Garage">
        <ActieFormulier actie={wijzigInstellingenActie} knop="Opslaan" knopVariant="secundair" wisNaSucces={false}>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Veld label="Naam"><Invoer name="naam" defaultValue={instellingen.naam} required maxLength={100} /></Veld>
            </div>
            <GarageAdresKiezer
              opgeslagen={locaties}
              begin={instellingen.garageAdres ? { adres: instellingen.garageAdres, lat: instellingen.garageLat, lng: instellingen.garageLng } : null}
            />
            <WerkdagenKeuze gekozen={instellingen.werkdagen} />
          </div>
        </ActieFormulier>
      </Paneel>
      <Paneel titel="Wachtwoord wijzigen" className="max-w-md">
        <ActieFormulier actie={wijzigWachtwoordActie} knop="Wachtwoord wijzigen">
          <Veld label="Huidig wachtwoord"><Invoer name="huidig" type="password" autoComplete="current-password" required /></Veld>
          <Veld label="Nieuw wachtwoord" hint="Minimaal 8 tekens">
            <Invoer name="nieuw" type="password" autoComplete="new-password" minLength={8} required />
          </Veld>
          <Veld label="Herhaal nieuw wachtwoord">
            <Invoer name="herhaal" type="password" autoComplete="new-password" minLength={8} required />
          </Veld>
        </ActieFormulier>
      </Paneel>
    </div>
  );
}
