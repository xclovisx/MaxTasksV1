import { describe, expect, it } from 'vitest';
import { planDoorschuiven, reeksSleutel } from '@/lib/domein/doorschuiven';

const WERKWEEK = [1, 2, 3, 4, 5];

describe('planDoorschuiven', () => {
  it('verplaatst achterstallige taken naar vandaag', () => {
    const plan = planDoorschuiven([{ id: 'a', datum: '2026-11-02', herhalingId: null }], '2026-11-04', WERKWEEK, new Set());
    expect(plan).toEqual({ verplaatsen: [{ id: 'a', naar: '2026-11-04' }], gemist: [] });
  });

  it('laat taken van vandaag en later staan', () => {
    const plan = planDoorschuiven([
      { id: 'a', datum: '2026-11-04', herhalingId: null },
      { id: 'b', datum: '2026-11-05', herhalingId: null },
    ], '2026-11-04', WERKWEEK, new Set());
    expect(plan).toEqual({ verplaatsen: [], gemist: [] });
  });

  it('schuift in het weekend door naar maandag', () => {
    const plan = planDoorschuiven([{ id: 'a', datum: '2026-11-06', herhalingId: null }], '2026-11-07', WERKWEEK, new Set());
    expect(plan.verplaatsen).toEqual([{ id: 'a', naar: '2026-11-09' }]);
  });

  it('markeert een reeks-taak als gemist als de reeks al een taak op de doeldag heeft', () => {
    const plan = planDoorschuiven(
      [{ id: 'a', datum: '2026-11-02', herhalingId: 'h1' }],
      '2026-11-04', WERKWEEK, new Set([reeksSleutel('h1', '2026-11-04')]),
    );
    expect(plan).toEqual({ verplaatsen: [], gemist: ['a'] });
  });

  it('verplaatst van één reeks alleen de nieuwste achterstallige taak', () => {
    const plan = planDoorschuiven([
      { id: 'oud', datum: '2026-11-02', herhalingId: 'h1' },
      { id: 'nieuw', datum: '2026-11-03', herhalingId: 'h1' },
    ], '2026-11-04', WERKWEEK, new Set());
    expect(plan).toEqual({ verplaatsen: [{ id: 'nieuw', naar: '2026-11-04' }], gemist: ['oud'] });
  });
});
