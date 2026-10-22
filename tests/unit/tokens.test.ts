import { describe, expect, it } from 'vitest';
import { gelijk, nieuweCode, nieuwToken, sha256 } from '@/lib/auth/tokens';

describe('tokens', () => {
  it('maakt een url-veilig token van 32 bytes', () => {
    const t = nieuwToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(nieuwToken()).not.toBe(t);
  });

  it('maakt een code van precies 6 cijfers', () => {
    for (let i = 0; i < 50; i++) expect(nieuweCode()).toMatch(/^\d{6}$/);
  });

  it('hasht deterministisch en vergelijkt veilig', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(gelijk('abc', 'abc')).toBe(true);
    expect(gelijk('abc', 'abd')).toBe(false);
    expect(gelijk('abc', 'abcd')).toBe(false);
  });
});
