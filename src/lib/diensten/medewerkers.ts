import { type Activatie, geefActivatie } from '../auth/activatie';
import type { Context } from '../context';
import { db, transactie } from '../db/client';
import { isUuid, medewerkerSchema, type MedewerkerInvoer } from '../domein/validatie';
import { NietGevonden, Ongeldig } from '../fouten';
import { vereisBeheerder } from './rechten';

export type Medewerker = {
  id: string;
  naam: string;
  gebruikersnaam: string;
  actief: boolean;
  geactiveerd: boolean;
  activatieVerlooptOp: Date | null;
};

function pgFoutcode(e: unknown): string | undefined {
  return typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : undefined;
}

export async function lijstMedewerkers(ctx: Context): Promise<Medewerker[]> {
  vereisBeheerder(ctx);
  const rijen = await db()<Medewerker[]>`
    select id, naam, gebruikersnaam, actief,
           (wachtwoord_hash is not null) as geactiveerd, activatie_verloopt_op
    from gebruikers
    where rol = 'medewerker'
    order by naam`;
  return rijen.map((r) => ({ ...r }));
}

export async function maakMedewerker(ctx: Context, invoer: MedewerkerInvoer): Promise<{ id: string; activatie: Activatie }> {
  vereisBeheerder(ctx);
  const v = medewerkerSchema.parse(invoer);
  try {
    return await transactie(async (tx) => {
      const [g] = await tx<{ id: string }[]>`
        insert into gebruikers (naam, gebruikersnaam, rol)
        values (${v.naam}, ${v.gebruikersnaam}, 'medewerker') returning id`;
      return { id: g.id, activatie: await geefActivatie(tx, g.id) };
    });
  } catch (e) {
    if (pgFoutcode(e) === '23505') throw new Ongeldig('Deze gebruikersnaam is al in gebruik.');
    throw e;
  }
}

export async function nieuweActivatie(ctx: Context, gebruikerId: string): Promise<Activatie> {
  vereisBeheerder(ctx);
  if (!isUuid(gebruikerId)) throw new NietGevonden('Medewerker niet gevonden');
  return transactie((tx) => geefActivatie(tx, gebruikerId));
}

export async function zetActief(ctx: Context, gebruikerId: string, actief: boolean): Promise<void> {
  vereisBeheerder(ctx);
  if (!isUuid(gebruikerId)) throw new NietGevonden('Medewerker niet gevonden');
  await transactie(async (tx) => {
    const rijen = await tx`update gebruikers set actief = ${actief} where id = ${gebruikerId} and rol = 'medewerker' returning id`;
    if (rijen.length === 0) throw new NietGevonden('Medewerker niet gevonden');
    if (!actief) await tx`delete from sessies where gebruiker_id = ${gebruikerId}`;
  });
}

export async function verwijderMedewerker(ctx: Context, gebruikerId: string): Promise<void> {
  vereisBeheerder(ctx);
  if (!isUuid(gebruikerId)) throw new NietGevonden('Medewerker niet gevonden');
  // Sessies verdwijnen mee (cascade); taken en historie houden hun regels, zonder naam (set null).
  const rijen = await db()`delete from gebruikers where id = ${gebruikerId} and rol = 'medewerker' returning id`;
  if (rijen.length === 0) throw new NietGevonden('Medewerker niet gevonden');
}
