import { redirect } from 'next/navigation';
import { cache } from 'react';
import { gebruikerVoorSessie, type SessieGebruiker } from '../auth/sessies';
import type { Context } from '../context';
import { leesSessieToken } from './sessie-cookie';

export const huidigeGebruiker = cache(async (): Promise<SessieGebruiker | null> => {
  const token = await leesSessieToken();
  return token ? gebruikerVoorSessie(token) : null;
});

export async function vereisGebruiker(): Promise<SessieGebruiker> {
  const g = await huidigeGebruiker();
  if (!g) redirect('/login');
  return g;
}

export async function vereisBeheerderSessie(): Promise<SessieGebruiker> {
  const g = await vereisGebruiker();
  if (g.rol !== 'beheerder') redirect('/');
  return g;
}

export function contextVan(g: SessieGebruiker): Context {
  return { gebruikerId: g.id, rol: g.rol };
}
