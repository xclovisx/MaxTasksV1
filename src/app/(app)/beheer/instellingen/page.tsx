import { wijzigInstellingenActie, wijzigMeldingenActie, wijzigWachtwoordActie } from '../acties';
import { ActieFormulier } from '@/components/actie-formulier';
import { GarageAdresKiezer } from '@/components/beheer/garage-adres-kiezer';
import { TestmeldingKnop } from '@/components/beheer/testmelding-knop';
import { WerkdagenKeuze } from '@/components/beheer/werkdagen-keuze';
import { Invoer, Paneel, Veld } from '@/components/ui';
import { haalInstellingen } from '@/lib/diensten/instellingen';
import { lijstLocaties } from '@/lib/diensten/locaties';
import { haalNtfyOnderwerp } from '@/lib/diensten/meldingen';
import { ntfyServer } from '@/lib/meldingen/ntfy';
import { vereisBeheerderSessie } from '@/lib/web/huidige-gebruiker';

export default async function InstellingenPagina() {
  await vereisBeheerderSessie();
  const [instellingen, locaties, onderwerp] = await Promise.all([haalInstellingen(), lijstLocaties(), haalNtfyOnderwerp()]);
  const server = ntfyServer();
  const publiek = process.env.NTFY_PUBLIEKE_URL?.trim().replace(/\/+$/, '') || null;
  const serverHost = server ? (URL.canParse(server) ? new URL(server).host : server) : null;
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
      <Paneel titel="Meldingen" className="max-w-md">
        <div className="space-y-4">
          <p className="text-xs text-tekst-zacht">
            {server
              ? publiek
                ? `Pushmeldingen gaan via ${publiek} — voeg deze server toe in de ntfy-app.`
                : `Pushmeldingen gaan via ${serverHost} naar de ntfy-app op je telefoon.`
              : 'NTFY_URL is nog niet ingesteld in .env, dus er worden geen meldingen verstuurd.'}
          </p>
          <ActieFormulier actie={wijzigMeldingenActie} knop="Opslaan" knopVariant="secundair" wisNaSucces={false}>
            <Veld label="ntfy-onderwerp" hint="Abonneer je in de ntfy-app op dit onderwerp. Alleen letters, cijfers, - en _. Kies iets dat niet te raden is.">
              <Invoer name="ntfyOnderwerp" defaultValue={onderwerp ?? ''} maxLength={64} pattern="[A-Za-z0-9_\-]*" />
            </Veld>
          </ActieFormulier>
          <div className="space-y-2">
            <p className="text-xs text-tekst-flauw">De testmelding gaat naar het opgeslagen onderwerp. Sla een gewijzigd onderwerp eerst op.</p>
            <TestmeldingKnop />
          </div>
        </div>
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
