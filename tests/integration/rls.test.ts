import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/lib/db/client';
import { metTenant, type Context } from '../../src/lib/db/tenant';
import { leegDatabase } from './helpers';

async function maakBedrijfMetTaak(naam: string) {
  const [b] = await db()<{ id: string }[]>`insert into bedrijven (naam) values (${naam}) returning id`;
  const [bord] = await db()<{ id: string }[]>`insert into borden (bedrijf_id, naam) values (${b.id}, 'Takenbord') returning id`;
  const [g] = await db()<{ id: string }[]>`insert into gebruikers (bedrijf_id, naam, gebruikersnaam, rol) values (${b.id}, ${naam}, ${naam.toLowerCase()}, 'medewerker') returning id`;
  await db()`insert into taken (bedrijf_id, bord_id, titel, datum, prioriteit, oorspronkelijke_datum) values (${b.id}, ${bord.id}, ${'Taak ' + naam}, '2026-10-22', 'middel', '2026-10-22')`;
  const ctx: Context = { gebruikerId: g.id, rol: 'medewerker', bedrijfId: b.id };
  return { bedrijfId: b.id, bordId: bord.id, ctx };
}

describe('row level security', () => {
  beforeEach(leegDatabase);

  it('een medewerker ziet alleen data van het eigen bedrijf', async () => {
    const a = await maakBedrijfMetTaak('A');
    await maakBedrijfMetTaak('B');
    const zicht = await metTenant(a.ctx, async (tx) => ({
      bedrijven: await tx<{ naam: string }[]>`select naam from bedrijven`,
      taken: await tx<{ titel: string }[]>`select titel from taken_weergave`,
      borden: await tx<{ id: string }[]>`select id from borden`,
    }));
    expect(zicht.bedrijven.map((r) => r.naam)).toEqual(['A']);
    expect(zicht.taken.map((r) => r.titel)).toEqual(['Taak A']);
    expect(zicht.borden.map((r) => r.id)).toEqual([a.bordId]);
  });

  it('een medewerker kan geen taak in een ander bedrijf invoegen', async () => {
    const a = await maakBedrijfMetTaak('A');
    const b = await maakBedrijfMetTaak('B');
    await expect(metTenant(a.ctx, (tx) => tx`insert into taken (bedrijf_id, bord_id, titel, datum, prioriteit, oorspronkelijke_datum)
      values (${b.bedrijfId}, ${b.bordId}, 'Inbraak', '2026-10-22', 'laag', '2026-10-22')`)).rejects.toThrow(/row-level security/);
  });

  it('een medewerker kan geen bedrijven aanmaken of sessies lezen', async () => {
    const a = await maakBedrijfMetTaak('A');
    await expect(metTenant(a.ctx, (tx) => tx`insert into bedrijven (naam) values ('Nep')`)).rejects.toThrow(/row-level security/);
    expect(await metTenant(a.ctx, (tx) => tx`select id from sessies`)).toHaveLength(0);
  });

  it('de beheerder ziet alles', async () => {
    await maakBedrijfMetTaak('A');
    await maakBedrijfMetTaak('B');
    const [beheerder] = await db()<{ id: string }[]>`insert into gebruikers (naam, gebruikersnaam, rol) values ('Max', 'max', 'beheerder') returning id`;
    const taken = await metTenant({ gebruikerId: beheerder.id, rol: 'beheerder', bedrijfId: null },
      (tx) => tx<{ titel: string }[]>`select titel from taken_weergave order by titel`);
    expect(taken.map((r) => r.titel)).toEqual(['Taak A', 'Taak B']);
  });

  it('geeft datums terug als string', async () => {
    const a = await maakBedrijfMetTaak('A');
    const [t] = await metTenant(a.ctx, (tx) => tx<{ datum: string }[]>`select datum from taken`);
    expect(t.datum).toBe('2026-10-22');
  });
});
