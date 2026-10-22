import { ZodError } from 'zod';
import { Conflict, Fout } from '../fouten';

export type ActieResultaat<T = null> = { ok: true; data: T } | { ok: false; fout: string; conflict?: boolean };
export type FormStaat = { fout: string } | null;
export type ActivatieWeergave = { link: string; code: string; verlooptOp: string };

function isNextIntern(e: unknown): boolean {
  if (typeof e !== 'object' || e === null || !('digest' in e)) return false;
  const digest = String((e as { digest: unknown }).digest);
  return digest.startsWith('NEXT_') || digest === 'DYNAMIC_SERVER_USAGE';
}

export async function voerUit<T>(fn: () => Promise<T>): Promise<ActieResultaat<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (isNextIntern(e)) throw e;
    if (e instanceof Conflict) return { ok: false, fout: e.message, conflict: true };
    if (e instanceof ZodError) return { ok: false, fout: e.issues[0]?.message ?? 'Ongeldige invoer' };
    if (e instanceof Fout) return { ok: false, fout: e.message };
    const code = crypto.randomUUID().slice(0, 8);
    console.error(`[fout ${code}]`, e);
    return { ok: false, fout: `Er ging iets mis (foutcode ${code}). Probeer het opnieuw.` };
  }
}
