import { transactie, type Tx } from '../db/client';
import { controleerWachtwoord } from './wachtwoord';

export const MAX_POGINGEN = 5;
export const BLOKKADE_MINUTEN = 15;

export type AuthResultaat = { ok: true; gebruikerId: string } | { ok: false; fout: string };

export type AuthGebruiker = {
  id: string;
  actief: boolean;
  wachtwoordHash: string | null;
  geblokkeerdTot: Date | null;
  activatieCodeHash: string | null;
  activatieVerlooptOp: Date | null;
};

const ONJUIST = 'Gebruikersnaam of wachtwoord onjuist.';

/** Leest de gebruiker met een rijslot (`for update`): pogingen per gebruiker worden zo serieel afgehandeld. */
export async function zoekAuthGebruiker(tx: Tx, gebruikersnaam: string): Promise<AuthGebruiker | null> {
  const [g] = await tx<AuthGebruiker[]>`
    select id, actief, wachtwoord_hash, geblokkeerd_tot, activatie_code_hash, activatie_verloopt_op
    from gebruikers where gebruikersnaam = ${gebruikersnaam.trim().toLowerCase()}
    for update`;
  return g ?? null;
}

export function blokkadeMelding(g: AuthGebruiker, nu = new Date()): string | null {
  if (!g.geblokkeerdTot || g.geblokkeerdTot <= nu) return null;
  const minuten = Math.ceil((g.geblokkeerdTot.getTime() - nu.getTime()) / 60_000);
  return `Te veel mislukte pogingen. Probeer het over ${minuten} ${minuten === 1 ? 'minuut' : 'minuten'} opnieuw.`;
}

export async function registreerMislukt(tx: Tx, gebruikerId: string): Promise<void> {
  await tx`
    update gebruikers set
      geblokkeerd_tot = case when mislukte_pogingen + 1 >= ${MAX_POGINGEN}
        then now() + make_interval(mins => ${BLOKKADE_MINUTEN}) else geblokkeerd_tot end,
      mislukte_pogingen = case when mislukte_pogingen + 1 >= ${MAX_POGINGEN} then 0 else mislukte_pogingen + 1 end
    where id = ${gebruikerId}`;
}

export async function inloggen(gebruikersnaam: string, wachtwoord: string): Promise<AuthResultaat> {
  return transactie(async (tx): Promise<AuthResultaat> => {
    const g = await zoekAuthGebruiker(tx, gebruikersnaam);
    if (!g) return { ok: false, fout: ONJUIST };
    const blokkade = blokkadeMelding(g);
    if (blokkade) return { ok: false, fout: blokkade };
    if (!g.actief || !g.wachtwoordHash) return { ok: false, fout: ONJUIST };
    if (!(await controleerWachtwoord(g.wachtwoordHash, wachtwoord))) {
      await registreerMislukt(tx, g.id);
      return { ok: false, fout: ONJUIST };
    }
    await tx`update gebruikers set mislukte_pogingen = 0, geblokkeerd_tot = null where id = ${g.id}`;
    return { ok: true, gebruikerId: g.id };
  });
}
