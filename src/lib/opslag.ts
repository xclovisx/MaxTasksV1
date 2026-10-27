import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { OpslagOntbreekt } from './fouten';

/** Staat in een map op de opslagschijf; ontbreekt het, dan is de schijf (nog) niet aangekoppeld. */
export const OPSLAG_MARKER = '.takenbord-opslag';

/** Aan bij een aparte opslagschijf: dan moet het controlebestand er zijn en maken we nooit zelf mappen aan. */
export const opslagControleAan = (): boolean => process.env.OPSLAG_CONTROLE === '1';

export const bijlagenMap = (): string => path.resolve(process.env.BIJLAGEN_MAP || '.opslag/bijlagen');

export async function opslagAanwezig(map: string, controle = opslagControleAan()): Promise<boolean> {
  if (!controle) return true;
  try {
    await access(path.join(map, OPSLAG_MARKER));
    return true;
  } catch {
    return false;
  }
}

export async function vereisOpslag(map: string, controle = opslagControleAan()): Promise<void> {
  if (controle) {
    if (!(await opslagAanwezig(map, true))) throw new OpslagOntbreekt();
    return;
  }
  await mkdir(map, { recursive: true });
}
