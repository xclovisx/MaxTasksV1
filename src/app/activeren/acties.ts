'use server';

import { redirect } from 'next/navigation';
import { activeerMetCode, activeerMetToken } from '@/lib/auth/activatie';
import { maakSessie } from '@/lib/auth/sessies';
import type { FormStaat } from '@/lib/web/actie';
import { zetSessieCookie } from '@/lib/web/sessie-cookie';

const veld = (f: FormData, k: string) => String(f.get(k) ?? '');

async function rondAf(gebruikerId: string): Promise<never> {
  const sessie = await maakSessie(gebruikerId);
  await zetSessieCookie(sessie.token, sessie.verlooptOp);
  redirect('/');
}

export async function activeerLinkActie(token: string, _: FormStaat, form: FormData): Promise<FormStaat> {
  if (veld(form, 'wachtwoord') !== veld(form, 'herhaal')) return { fout: 'De wachtwoorden zijn niet gelijk.' };
  const r = await activeerMetToken(token, veld(form, 'wachtwoord'));
  if (!r.ok) return { fout: r.fout };
  return rondAf(r.gebruikerId);
}

export async function activeerCodeActie(_: FormStaat, form: FormData): Promise<FormStaat> {
  if (veld(form, 'wachtwoord') !== veld(form, 'herhaal')) return { fout: 'De wachtwoorden zijn niet gelijk.' };
  const r = await activeerMetCode(veld(form, 'gebruikersnaam'), veld(form, 'code'), veld(form, 'wachtwoord'));
  if (!r.ok) return { fout: r.fout };
  return rondAf(r.gebruikerId);
}
