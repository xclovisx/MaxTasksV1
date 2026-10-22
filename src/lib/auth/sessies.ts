import type { Rol } from '../context';
import { db } from '../db/client';
import { nieuwToken, sha256 } from './tokens';

export type SessieGebruiker = { id: string; naam: string; gebruikersnaam: string; rol: Rol };

export const SESSIE_DUUR_MS = 30 * 24 * 60 * 60 * 1000;

export async function maakSessie(gebruikerId: string): Promise<{ token: string; verlooptOp: Date }> {
  const token = nieuwToken();
  const verlooptOp = new Date(Date.now() + SESSIE_DUUR_MS);
  await db()`insert into sessies (id, gebruiker_id, verloopt_op) values (${sha256(token)}, ${gebruikerId}, ${verlooptOp})`;
  return { token, verlooptOp };
}

export async function gebruikerVoorSessie(token: string): Promise<SessieGebruiker | null> {
  const [r] = await db()<SessieGebruiker[]>`
    select g.id, g.naam, g.gebruikersnaam, g.rol
    from sessies s join gebruikers g on g.id = s.gebruiker_id
    where s.id = ${sha256(token)} and s.verloopt_op > now() and g.actief and g.wachtwoord_hash is not null`;
  return r ? { ...r } : null;
}

export async function verwijderSessie(token: string): Promise<void> {
  await db()`delete from sessies where id = ${sha256(token)}`;
}
