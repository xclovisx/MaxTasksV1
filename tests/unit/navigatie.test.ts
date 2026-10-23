import { describe, expect, it } from 'vitest';
import { formatAfstand, formatDuur, navigatieUrl, routeUrl, stopsSamenvatting } from '@/lib/domein/navigatie';

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

  it('bouwt een route-link met start, bestemming en tussenstops', () => {
    expect(routeUrl({
      start: { lat: 51.6, lng: 4.8 },
      bestemming: { lat: 51.55, lng: 4.7 },
      stops: [{ lat: 51.51, lng: 4.71 }, { lat: 51.52, lng: 4.72 }],
    })).toBe('https://www.google.com/maps/dir/?api=1&origin=51.6%2C4.8&destination=51.55%2C4.7&waypoints=51.51%2C4.71%7C51.52%2C4.72&travelmode=driving');
  });

  it('zonder start valt origin weg; zonder bestemming eindigt de rit bij de laatste stop', () => {
    expect(routeUrl({ start: null, bestemming: null, stops: [{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }] }))
      .toBe('https://www.google.com/maps/dir/?api=1&destination=3%2C4&waypoints=1%2C2&travelmode=driving');
    expect(routeUrl({ start: null, bestemming: null, stops: [{ lat: 1, lng: 2 }] }))
      .toBe('https://www.google.com/maps/dir/?api=1&destination=1%2C2&travelmode=driving');
  });

  it('schrijft reistijd en afstand leesbaar', () => {
    expect(formatDuur(20)).toBe('< 1 min');
    expect(formatDuur(600)).toBe('10 min');
    expect(formatDuur(3600)).toBe('1 u');
    expect(formatDuur(3900)).toBe('1 u 5 min');
    expect(formatAfstand(850)).toBe('850 m');
    expect(formatAfstand(12345)).toBe('12,3 km');
  });
});
