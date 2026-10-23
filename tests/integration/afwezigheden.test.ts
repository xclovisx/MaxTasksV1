import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Context } from '../../src/lib/context';
import { luisterNaarWijzigingen } from '../../src/lib/db/gebeurtenissen';
import {
  afwezighedenInPeriode, afwezigheidWaarschuwing, lijstAfwezigheden, maakAfwezigheid, verwijderAfwezigheid, wijzigAfwezigheid,
} from '../../src/lib/diensten/afwezigheden';
import { GeenToegang, NietGevonden } from '../../src/lib/fouten';
import { leegDatabase, maakBeheerderCtx, maakMedewerkerCtx } from './helpers';

let beheerder: Context;
let piet: Context;
const tandarts = { begindatum: '2026-11-03', heleDag: false, van: '13:00', tot: '15:00', reden: 'tandarts' };

beforeEach(async () => {
  await leegDatabase();
  beheerder = await maakBeheerderCtx();
  piet = await maakMedewerkerCtx('piet', 'Piet');
});

describe('afwezigheden', () => {
  it('alleen de beheerder beheert blokken', async () => {
    await expect(maakAfwezigheid(piet, tandarts)).rejects.toBeInstanceOf(GeenToegang);
    const { id } = await maakAfwezigheid(beheerder, tandarts);
    await expect(wijzigAfwezigheid(piet, id, tandarts)).rejects.toBeInstanceOf(GeenToegang);
    await expect(verwijderAfwezigheid(piet, id)).rejects.toBeInstanceOf(GeenToegang);
  });

  it('bewaart, wijzigt en verwijdert een blok', async () => {
    const { id } = await maakAfwezigheid(beheerder, { ...tandarts, herhaling: { type: 'weekdagen', weekdagen: [2, 4] } });
    expect(await lijstAfwezigheden()).toEqual([{
      id, begindatum: '2026-11-03', einddatum: null, heleDag: false, van: '13:00', tot: '15:00', reden: 'tandarts',
      herhalingType: 'weekdagen', weekdagen: [2, 4], intervalWeken: 1,
    }]);
    await wijzigAfwezigheid(beheerder, id, { begindatum: '2026-11-03', einddatum: '2026-11-07', heleDag: true, reden: '' });
    expect(await lijstAfwezigheden()).toEqual([{
      id, begindatum: '2026-11-03', einddatum: '2026-11-07', heleDag: true, van: null, tot: null, reden: null,
      herhalingType: null, weekdagen: [], intervalWeken: 1,
    }]);
    await verwijderAfwezigheid(beheerder, id);
    expect(await lijstAfwezigheden()).toEqual([]);
    await expect(verwijderAfwezigheid(beheerder, id)).rejects.toBeInstanceOf(NietGevonden);
    await expect(wijzigAfwezigheid(beheerder, 'geen-uuid', tandarts)).rejects.toBeInstanceOf(NietGevonden);
  });

  it('geeft per dag de blokken met de naam van de beheerder', async () => {
    await maakAfwezigheid(beheerder, tandarts);
    await maakAfwezigheid(beheerder, {
      begindatum: '2026-11-05', heleDag: true, reden: 'vrij', herhaling: { type: 'wekelijks', weekdagen: [], intervalWeken: 1 },
    });
    const { naam, perDag } = await afwezighedenInPeriode('2026-11-02', '2026-11-15');
    expect(naam).toBe('Max');
    expect(Object.keys(perDag).sort()).toEqual(['2026-11-03', '2026-11-05', '2026-11-12']);
    expect(perDag['2026-11-03'].map((b) => b.reden)).toEqual(['tandarts']);
  });

  it('geeft de waarschuwing voor het taakvenster', async () => {
    await maakAfwezigheid(beheerder, tandarts);
    expect(await afwezigheidWaarschuwing('2026-11-03', '14:00')).toBe('Max is dan niet beschikbaar (tandarts).');
    expect(await afwezigheidWaarschuwing('2026-11-03', null)).toBe('Let op: Max is die dag van 13:00 tot 15:00 niet beschikbaar.');
    expect(await afwezigheidWaarschuwing('2026-11-04', '14:00')).toBeNull();
    expect(await afwezigheidWaarschuwing('onzin', '14:00')).toBeNull();
  });

  it('seint alle borden na een wijziging', async () => {
    const ontvangen: string[] = [];
    const stop = await luisterNaarWijzigingen((id) => ontvangen.push(id));
    await maakAfwezigheid(beheerder, tandarts);
    await vi.waitFor(() => expect(ontvangen).toContain('afwezigheid'), { timeout: 3000 });
    await stop();
  });
});
