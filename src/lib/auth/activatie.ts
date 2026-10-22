import { db, transactie, type Tx } from '../db/client';
import { NietGevonden } from '../fouten';
import { type AuthResultaat, blokkadeMelding, registreerMislukt, zoekAuthGebruiker } from './inloggen';
import { gelijk, nieuweCode, nieuwToken, sha256 } from './tokens';
import { hashWachtwoord, wachtwoordFout } from './wachtwoord';

export const ACTIVATIE_DUUR_UUR = 48;
export const ONGELDIGE_ACTIVATIE = 'Deze link of code is niet meer geldig. Vraag een nieuwe aan bij de beheerder.';

export type Activatie = { token: string; code: string; verlooptOp: Date };

/** Draait binnen de transactie van de beheerder. Maakt wachtwoord en sessies ongeldig. */
export async function geefActivatie(tx: Tx, gebruikerId: string): Promise<Activatie> {
  const token = nieuwToken();
  const code = nieuweCode();
  const verlooptOp = new Date(Date.now() + ACTIVATIE_DUUR_UUR * 3600_000);
  const rijen = await tx`
    update gebruikers set
      wachtwoord_hash = null,
      activatie_token_hash = ${sha256(token)},
      activatie_code_hash = ${sha256(code)},
      activatie_verloopt_op = ${verlooptOp},
      mislukte_pogingen = 0,
      geblokkeerd_tot = null
    where id = ${gebruikerId} and rol = 'medewerker'
    returning id`;
  if (rijen.length === 0) throw new NietGevonden('Medewerker niet gevonden');
  await tx`delete from sessies where gebruiker_id = ${gebruikerId}`;
  return { token, code, verlooptOp };
}

export async function activatieVoorToken(token: string): Promise<{ naam: string } | null> {
  const [g] = await db()<{ naam: string }[]>`
    select naam from gebruikers
    where activatie_token_hash = ${sha256(token)} and activatie_verloopt_op > now() and actief`;
  return g ? { naam: g.naam } : null;
}

async function zetWachtwoord(tx: Tx, gebruikerId: string, wachtwoord: string): Promise<void> {
  await tx`
    update gebruikers set
      wachtwoord_hash = ${await hashWachtwoord(wachtwoord)},
      activatie_token_hash = null,
      activatie_code_hash = null,
      activatie_verloopt_op = null,
      mislukte_pogingen = 0,
      geblokkeerd_tot = null
    where id = ${gebruikerId}`;
}

export async function activeerMetToken(token: string, wachtwoord: string): Promise<AuthResultaat> {
  const fout = wachtwoordFout(wachtwoord);
  if (fout) return { ok: false, fout };
  const tokenHash = sha256(token);
  return transactie(async (tx): Promise<AuthResultaat> => {
    const [g] = await tx<{ id: string }[]>`
      select id from gebruikers
      where activatie_token_hash = ${tokenHash} and activatie_verloopt_op > now() and actief
      for update`;
    if (!g) return { ok: false, fout: ONGELDIGE_ACTIVATIE };
    // Na het rijslot is de token opnieuw gecontroleerd: een gelijktijdige activatie of nieuwe uitgifte wint niet meer.
    const rijen = await tx`
      update gebruikers set
        wachtwoord_hash = ${await hashWachtwoord(wachtwoord)},
        activatie_token_hash = null,
        activatie_code_hash = null,
        activatie_verloopt_op = null,
        mislukte_pogingen = 0,
        geblokkeerd_tot = null
      where id = ${g.id} and activatie_token_hash = ${tokenHash} and activatie_verloopt_op > now() and actief
      returning id`;
    if (rijen.length === 0) return { ok: false, fout: ONGELDIGE_ACTIVATIE };
    return { ok: true, gebruikerId: g.id };
  });
}

export async function activeerMetCode(gebruikersnaam: string, code: string, wachtwoord: string): Promise<AuthResultaat> {
  const fout = wachtwoordFout(wachtwoord);
  if (fout) return { ok: false, fout };
  return transactie(async (tx): Promise<AuthResultaat> => {
    const g = await zoekAuthGebruiker(tx, gebruikersnaam);
    if (!g || !g.actief) return { ok: false, fout: ONGELDIGE_ACTIVATIE };
    const blokkade = blokkadeMelding(g);
    if (blokkade) return { ok: false, fout: blokkade };
    if (!g.activatieCodeHash || !g.activatieVerlooptOp || g.activatieVerlooptOp <= new Date()) {
      return { ok: false, fout: ONGELDIGE_ACTIVATIE };
    }
    if (!gelijk(sha256(code.trim()), g.activatieCodeHash)) {
      await registreerMislukt(tx, g.id);
      return { ok: false, fout: 'Activatiecode onjuist.' };
    }
    await zetWachtwoord(tx, g.id, wachtwoord);
    return { ok: true, gebruikerId: g.id };
  });
}
