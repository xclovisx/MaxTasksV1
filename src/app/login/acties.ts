'use server';

import { redirect } from 'next/navigation';
import { inloggen } from '@/lib/auth/inloggen';
import { maakSessie, verwijderSessie } from '@/lib/auth/sessies';
import type { FormStaat } from '@/lib/web/actie';
import { leesSessieToken, wisSessieCookie, zetSessieCookie } from '@/lib/web/sessie-cookie';

export async function inlogActie(_: FormStaat, form: FormData): Promise<FormStaat> {
  const r = await inloggen(String(form.get('gebruikersnaam') ?? ''), String(form.get('wachtwoord') ?? ''));
  if (!r.ok) return { fout: r.fout };
  const sessie = await maakSessie(r.gebruikerId);
  await zetSessieCookie(sessie.token, sessie.verlooptOp);
  redirect('/');
}

export async function uitlogActie(): Promise<void> {
  const token = await leesSessieToken();
  if (token) await verwijderSessie(token);
  await wisSessieCookie();
  redirect('/login');
}
