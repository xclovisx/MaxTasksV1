import { db } from '../db/client';
import { Ongeldig } from '../fouten';
import { controleerWachtwoord, hashWachtwoord, wachtwoordFout } from './wachtwoord';

export async function maakBeheerder(naam: string, gebruikersnaam: string, wachtwoord: string): Promise<string> {
  const fout = wachtwoordFout(wachtwoord);
  if (fout) throw new Ongeldig(fout);
  const [r] = await db()<{ id: string }[]>`
    insert into gebruikers (naam, gebruikersnaam, wachtwoord_hash, rol)
    values (${naam.trim()}, ${gebruikersnaam.trim().toLowerCase()}, ${await hashWachtwoord(wachtwoord)}, 'beheerder')
    returning id`;
  return r.id;
}

export async function wijzigEigenWachtwoord(gebruikerId: string, huidig: string, nieuw: string): Promise<void> {
  const [g] = await db()<{ wachtwoordHash: string | null }[]>`select wachtwoord_hash from gebruikers where id = ${gebruikerId}`;
  if (!g?.wachtwoordHash || !(await controleerWachtwoord(g.wachtwoordHash, huidig))) {
    throw new Ongeldig('Huidig wachtwoord onjuist.');
  }
  const fout = wachtwoordFout(nieuw);
  if (fout) throw new Ongeldig(fout);
  await db()`update gebruikers set wachtwoord_hash = ${await hashWachtwoord(nieuw)} where id = ${gebruikerId}`;
}
