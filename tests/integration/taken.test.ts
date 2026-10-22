import { beforeEach, describe, expect, it } from 'vitest';
import type { Context } from '../../src/lib/context';
import { db } from '../../src/lib/db/client';
import { wijzigBord } from '../../src/lib/diensten/borden';
import {
  haalTaak, maakTaak, taakHistorie, takenOpDatum, takenVoorPeriode, verplaatsTaak, verwijderTaak, wijzigTaak, zetStatus,
} from '../../src/lib/diensten/taken';
import { Conflict, GeenToegang, NietGevonden } from '../../src/lib/fouten';
import { leegDatabase, maakBeheerderCtx, maakBord, maakMedewerkerCtx } from './helpers';

let beheerder: Context;
let piet: Context;
let klaas: Context;
let bordA: string;

const velden = (titel: string, extra: Record<string, unknown> = {}) => ({
  titel, omschrijving: '', datum: '2026-10-22', tijd: null, prioriteit: 'middel' as const, ...extra,
});

beforeEach(async () => {
  await leegDatabase();
  beheerder = await maakBeheerderCtx();
  bordA = await maakBord('Takenbord');
  piet = await maakMedewerkerCtx('piet', 'Piet');
  klaas = await maakMedewerkerCtx('klaas', 'Klaas');
});

const nieuw = (ctx: Context, titel: string, extra: Record<string, unknown> = {}) =>
  maakTaak(ctx, { bordId: bordA, herhaling: null, ...velden(titel, extra) });

describe('taken lezen en aanmaken', () => {
  it('maakt taken en geeft ze gesorteerd terug met namen', async () => {
    await nieuw(piet, 'Later', { tijd: '13:00' });
    await nieuw(piet, 'Vroeg', { tijd: '08:30' });
    await nieuw(piet, 'Dringend', { prioriteit: 'nu' });
    await nieuw(piet, 'Morgen', { datum: '2026-10-23', prioriteit: 'nu' });
    await nieuw(piet, 'Buiten week', { datum: '2026-10-30' });
    const taken = await takenVoorPeriode(bordA, '2026-10-19', '2026-10-25');
    expect(taken.map((t) => t.titel)).toEqual(['Dringend', 'Vroeg', 'Later', 'Morgen']);
    expect(taken[1]).toMatchObject({ datum: '2026-10-22', tijd: '08:30', status: 'open', versie: 1, aangemaaktDoorNaam: 'Piet', bordNaam: 'Takenbord' });
  });

  it('geeft NietGevonden voor onbekende taken en borden', async () => {
    const onbekend = crypto.randomUUID();
    await expect(haalTaak(onbekend)).rejects.toBeInstanceOf(NietGevonden);
    await expect(wijzigTaak(piet, onbekend, 1, velden('X'))).rejects.toBeInstanceOf(NietGevonden);
    await expect(verwijderTaak(piet, onbekend)).rejects.toBeInstanceOf(NietGevonden);
    await expect(maakTaak(piet, { bordId: onbekend, herhaling: null, ...velden('X') })).rejects.toBeInstanceOf(NietGevonden);
  });

  it('weigert taken op een gearchiveerd bord', async () => {
    await wijzigBord(beheerder, bordA, { naam: 'Oud', gearchiveerd: true });
    await expect(nieuw(piet, 'X')).rejects.toBeInstanceOf(NietGevonden);
  });
});

describe('taken wijzigen', () => {
  it('een collega kan wijzigen; versie en gewijzigd-door lopen mee', async () => {
    const { id } = await nieuw(piet, 'Banden');
    await wijzigTaak(klaas, id, 1, velden('Banden ophalen', { prioriteit: 'hoog' }));
    expect(await haalTaak(id)).toMatchObject({ titel: 'Banden ophalen', prioriteit: 'hoog', versie: 2, gewijzigdDoorNaam: 'Klaas' });
  });

  it('geeft een conflict bij een verouderde versie', async () => {
    const { id } = await nieuw(piet, 'Banden');
    await wijzigTaak(klaas, id, 1, velden('Versie Klaas'));
    const fout = await wijzigTaak(piet, id, 1, velden('Versie Piet')).catch((e) => e);
    expect(fout).toBeInstanceOf(Conflict);
    expect(fout.message).toBe('Deze taak is zojuist gewijzigd door Klaas. Herladen?');
    expect((await haalTaak(id)).titel).toBe('Versie Klaas');
  });

  it('verplaatsen wist uitgesteld en gemist', async () => {
    const { id } = await nieuw(piet, 'Tanken');
    await db()`update taken set uitgesteld_van = '2026-10-20', gemist = true where id = ${id}`;
    await verplaatsTaak(piet, id, 1, '2026-10-23');
    expect(await haalTaak(id)).toMatchObject({ datum: '2026-10-23', uitgesteldVan: null, gemist: false, versie: 2 });
  });

  it('alleen de beheerder wijzigt de status', async () => {
    const { id } = await nieuw(piet, 'Tanken');
    await expect(zetStatus(piet, id, 1, 'bezig')).rejects.toBeInstanceOf(GeenToegang);
    await zetStatus(beheerder, id, 1, 'klaar');
    const klaar = await haalTaak(id);
    expect(klaar.status).toBe('klaar');
    expect(klaar.klaarOp).toBeInstanceOf(Date);
    await zetStatus(beheerder, id, 2, 'open');
    expect((await haalTaak(id)).klaarOp).toBeNull();
  });

  it('verwijdert een taak', async () => {
    const { id } = await nieuw(piet, 'Weg');
    await verwijderTaak(klaas, id);
    await expect(haalTaak(id)).rejects.toBeInstanceOf(NietGevonden);
    await expect(verwijderTaak(klaas, id)).rejects.toBeInstanceOf(NietGevonden);
  });

  it('houdt historie bij, nieuwste eerst', async () => {
    const { id } = await nieuw(piet, 'Banden');
    await wijzigTaak(klaas, id, 1, velden('Banden ophalen'));
    await zetStatus(beheerder, id, 2, 'bezig');
    const historie = await taakHistorie(id);
    expect(historie.map((h) => [h.naam, h.wijzigingen])).toEqual([
      ['Max', { status: { oud: 'open', nieuw: 'bezig' } }],
      ['Klaas', { titel: { oud: 'Banden', nieuw: 'Banden ophalen' } }],
    ]);
  });
});

describe('takenOpDatum', () => {
  it('geeft taken van alle borden, zonder gearchiveerde borden', async () => {
    const bordB = await maakBord('Werkplaats');
    await nieuw(piet, 'A-taak', { prioriteit: 'laag' });
    await maakTaak(piet, { bordId: bordB, herhaling: null, ...velden('B-taak', { prioriteit: 'nu' }) });
    expect((await takenOpDatum('2026-10-22')).map((t) => `${t.bordNaam}:${t.titel}`)).toEqual(['Werkplaats:B-taak', 'Takenbord:A-taak']);
    await wijzigBord(beheerder, bordB, { naam: 'Oud', gearchiveerd: true });
    expect((await takenOpDatum('2026-10-22')).map((t) => t.titel)).toEqual(['A-taak']);
  });
});
