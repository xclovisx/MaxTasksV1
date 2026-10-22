import { describe, expect, it } from 'vitest';
import { navigatieUrl, stopsSamenvatting } from '@/lib/domein/navigatie';

describe('navigatie', () => {
  it('bouwt een Google Maps-link naar één bestemming', () => {
    expect(navigatieUrl({ lat: 51.589, lng: 4.776 }))
      .toBe('https://www.google.com/maps/dir/?api=1&destination=51.589%2C4.776&travelmode=driving');
  });

  it('vat stops samen voor op de kaart', () => {
    expect(stopsSamenvatting([])).toBeNull();
    expect(stopsSamenvatting([{ naam: 'Banden-Plus' }])).toBe('Banden-Plus');
    expect(stopsSamenvatting([{ naam: 'A' }, { naam: 'B' }, { naam: 'C' }])).toBe('3 stops');
  });
});
