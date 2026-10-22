import { db, type Tx } from './client';

export type Rol = 'beheerder' | 'medewerker';
export type Context = { gebruikerId: string; rol: Rol; bedrijfId: string | null };

/** Voert fn uit in een transactie waarin Row Level Security voor deze gebruiker geldt. */
export async function metTenant<T>(ctx: Context, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const resultaat = await db().begin(async (tx) => {
    await tx`select
      set_config('app.rol', ${ctx.rol}, true),
      set_config('app.bedrijf_id', ${ctx.bedrijfId ?? ''}, true),
      set_config('app.gebruiker_id', ${ctx.gebruikerId}, true)`;
    await tx`set local role takenbord_app`;
    return fn(tx);
  });
  return resultaat as T;
}
