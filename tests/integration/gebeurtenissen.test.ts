import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Context } from '../../src/lib/context';
import { transactie } from '../../src/lib/db/client';
import { meldWijziging, luisterNaarWijzigingen } from '../../src/lib/db/gebeurtenissen';
import { maakTaak } from '../../src/lib/diensten/taken';
import { leegDatabase, maakBord, maakMedewerkerCtx } from './helpers';

let piet: Context;
let bordId: string;

beforeEach(async () => {
  await leegDatabase();
  bordId = await maakBord('Takenbord');
  piet = await maakMedewerkerCtx('piet');
});

describe('gebeurtenissen', () => {
  it('meldt een nieuwe taak aan luisteraars', async () => {
    const ontvangen: string[] = [];
    const stop = await luisterNaarWijzigingen((id) => ontvangen.push(id));
    await maakTaak(piet, { bordId, titel: 'Live', omschrijving: '', datum: '2026-10-22', tijd: null, prioriteit: 'laag', herhaling: null });
    await vi.waitFor(() => expect(ontvangen).toContain(bordId), { timeout: 3000 });
    await stop();
  });

  it('meldt niets als de transactie mislukt', async () => {
    const ontvangen: string[] = [];
    const stop = await luisterNaarWijzigingen((id) => ontvangen.push(id));
    await expect(transactie(async (tx) => {
      await meldWijziging(tx, bordId);
      throw new Error('terugdraaien');
    })).rejects.toThrow('terugdraaien');
    await new Promise((r) => setTimeout(r, 300));
    expect(ontvangen).toEqual([]);
    await stop();
  });
});
