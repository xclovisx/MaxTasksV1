import { cookies } from 'next/headers';

const NAAM = 'sessie';

export async function zetSessieCookie(token: string, verlooptOp: Date): Promise<void> {
  (await cookies()).set(NAAM, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: verlooptOp,
  });
}

export async function leesSessieToken(): Promise<string | null> {
  return (await cookies()).get(NAAM)?.value ?? null;
}

export async function wisSessieCookie(): Promise<void> {
  (await cookies()).delete(NAAM);
}
