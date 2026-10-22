import { describe, expect, it } from 'vitest';
import { taakLabels, vergelijkTaken, type Prioriteit, type Status } from '@/lib/domein/taak';

const t = (p: Prioriteit, tijd: string | null, status: Status = 'open', ms = 0) =>
  ({ prioriteit: p, tijd, status, aangemaaktOp: new Date(ms) });

describe('vergelijkTaken', () => {
  it('sorteert op prioriteit, dan tijd, dan aanmaakmoment; klaar onderaan', () => {
    const lijst = [
      t('laag', null, 'open', 1),
      t('middel', '13:00'),
      t('nu', null, 'klaar'),
      t('middel', '08:30'),
      t('middel', null, 'open', 5),
      t('middel', null, 'open', 2),
      t('nu', null),
      t('zsm', null),
    ];
    const sleutels = [...lijst].sort(vergelijkTaken).map((x) => `${x.prioriteit}/${x.tijd ?? '-'}/${x.status}/${x.aangemaaktOp.getTime()}`);
    expect(sleutels).toEqual([
      'nu/-/open/0',
      'zsm/-/open/0',
      'middel/08:30/open/0',
      'middel/13:00/open/0',
      'middel/-/open/2',
      'middel/-/open/5',
      'laag/-/open/1',
      'nu/-/klaar/0',
    ]);
  });
});

describe('taakLabels', () => {
  it('toont uitgesteld met de oude dag', () => {
    expect(taakLabels({ status: 'open', prioriteit: 'middel', gemist: false, uitgesteldVan: '2026-10-20' }))
      .toEqual([{ soort: 'uitgesteld', tekst: 'uitgesteld van di 20 okt' }]);
  });

  it('markeert uitgestelde zsm- en nu-taken als achterstallig', () => {
    expect(taakLabels({ status: 'bezig', prioriteit: 'nu', gemist: false, uitgesteldVan: '2026-10-20' }).map((l) => l.soort))
      .toEqual(['uitgesteld', 'achterstallig']);
  });

  it('toont gemist en verder niets', () => {
    expect(taakLabels({ status: 'open', prioriteit: 'nu', gemist: true, uitgesteldVan: null }))
      .toEqual([{ soort: 'gemist', tekst: 'gemist' }]);
  });

  it('toont geen labels bij klaar', () => {
    expect(taakLabels({ status: 'klaar', prioriteit: 'nu', gemist: false, uitgesteldVan: '2026-10-20' })).toEqual([]);
  });
});
