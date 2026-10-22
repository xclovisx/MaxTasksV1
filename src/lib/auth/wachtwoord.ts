import { hash, verify } from '@node-rs/argon2';

export const MIN_WACHTWOORD = 8;

/** Argon2id (standaard van @node-rs/argon2). */
export function hashWachtwoord(wachtwoord: string): Promise<string> {
  return hash(wachtwoord);
}

export async function controleerWachtwoord(opgeslagen: string, wachtwoord: string): Promise<boolean> {
  try {
    return await verify(opgeslagen, wachtwoord);
  } catch {
    return false;
  }
}

export function wachtwoordFout(wachtwoord: string): string | null {
  return wachtwoord.length < MIN_WACHTWOORD ? `Kies een wachtwoord van minstens ${MIN_WACHTWOORD} tekens.` : null;
}
