import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { activeerMetToken } from '../../src/lib/auth/activatie';
import { gebruikerVoorSessie, maakSessie } from '../../src/lib/auth/sessies';
import type { Context } from '../../src/lib/context';
import { transactie } from '../../src/lib/db/client';
import { bordInTx, haalBord, lijstBorden, maakBord, wijzigBord } from '../../src/lib/diensten/borden';
import { haalInstellingen, wijzigInstellingen } from '../../src/lib/diensten/instellingen';
import { lijstMedewerkers, maakMedewerker, nieuweActivatie, verwijderMedewerker, zetActief } from '../../src/lib/diensten/medewerkers';
import { haalTaak, maakTaak, taakHistorie, wijzigTaak } from '../../src/lib/diensten/taken';
import { GeenToegang, NietGevonden, Ongeldig } from '../../src/lib/fouten';
import { leegDatabase, maakBeheerderCtx, maakBord as maakTestbord, maakMedewerkerCtx } from './helpers';

let beheerder: Context;

beforeEach(async () => {
  await leegDatabase();
  beheerder = await maakBeheerderCtx();
});

describe('instellingen', () => {
  it('leest de standaardinstellingen', async () => {
    expect(await haalInstellingen()).toEqual({ naam: 'Garage', garageAdres: null, garageLat: null, garageLng: null, werkdagen: [1, 2, 3, 4, 5] });
  });

  it('wijzigt de instellingen en valideert werkdagen', async () => {
    await wijzigInstellingen(beheerder, { naam: 'Garage Jansen', garageAdres: 'Dorpsstraat 1', werkdagen: [1, 2, 3, 4, 5, 6] });
    expect(await haalInstellingen()).toEqual({ naam: 'Garage Jansen', garageAdres: 'Dorpsstraat 1', garageLat: null, garageLng: null, werkdagen: [1, 2, 3, 4, 5, 6] });

    await wijzigInstellingen(beheerder, { naam: 'B', garageAdres: '', werkdagen: [5, 1] });
    expect(await haalInstellingen()).toEqual({ naam: 'B', garageAdres: null, garageLat: null, garageLng: null, werkdagen: [1, 5] });

    await expect(wijzigInstellingen(beheerder, { naam: 'B', werkdagen: [] })).rejects.toThrow();
    expect((await haalInstellingen()).werkdagen).toEqual([1, 5]);
  });

  it('sorteert werkdagen numeriek', async () => {
    await wijzigInstellingen(beheerder, { naam: 'B', werkdagen: [7, 2, 3] });
    expect((await haalInstellingen()).werkdagen).toEqual([2, 3, 7]);
  });
});

describe('rechten', () => {
  it('een medewerker mag niets beheren', async () => {
    const piet = await maakMedewerkerCtx('piet');
    const bord = await maakBord(beheerder, 'Werkplaats');
    const medewerker = await maakMedewerker(beheerder, { naam: 'Kees', gebruikersnaam: 'kees' });

    await expect(wijzigInstellingen(piet, { naam: 'X', werkdagen: [1] })).rejects.toBeInstanceOf(GeenToegang);
    await expect(maakBord(piet, 'Extra')).rejects.toBeInstanceOf(GeenToegang);
    await expect(wijzigBord(piet, bord.id, { naam: 'X', gearchiveerd: false })).rejects.toBeInstanceOf(GeenToegang);
    await expect(maakMedewerker(piet, { naam: 'X', gebruikersnaam: 'xxx' })).rejects.toBeInstanceOf(GeenToegang);
    await expect(lijstMedewerkers(piet)).rejects.toBeInstanceOf(GeenToegang);
    await expect(nieuweActivatie(piet, medewerker.id)).rejects.toBeInstanceOf(GeenToegang);
    await expect(zetActief(piet, medewerker.id, false)).rejects.toBeInstanceOf(GeenToegang);
    await expect(verwijderMedewerker(piet, medewerker.id)).rejects.toBeInstanceOf(GeenToegang);
    expect((await haalInstellingen()).naam).toBe('Garage');
  });
});

describe('borden', () => {
  it('toont gearchiveerde borden alleen op verzoek', async () => {
    const extra = await maakBord(beheerder, 'Werkplaats');
    await wijzigBord(beheerder, extra.id, { naam: 'Werkplaats oud', gearchiveerd: true });
    await maakBord(beheerder, 'Balie');

    expect((await lijstBorden()).map((x) => x.naam)).toEqual(['Balie']);
    expect((await lijstBorden({ metGearchiveerd: true })).map((x) => x.naam)).toEqual(['Balie', 'Werkplaats oud']);
    expect(await haalBord(extra.id)).toEqual({ id: extra.id, naam: 'Werkplaats oud', gearchiveerd: true });
  });

  it('geeft NietGevonden voor een onbekend of ongeldig id', async () => {
    await expect(haalBord('onzin')).rejects.toBeInstanceOf(NietGevonden);
    await expect(haalBord(randomUUID())).rejects.toBeInstanceOf(NietGevonden);
    await expect(wijzigBord(beheerder, randomUUID(), { naam: 'X', gearchiveerd: false })).rejects.toBeInstanceOf(NietGevonden);
    await expect(wijzigBord(beheerder, 'onzin', { naam: 'X', gearchiveerd: false })).rejects.toBeInstanceOf(NietGevonden);
  });

  it('valideert de naam van een bord', async () => {
    await expect(maakBord(beheerder, '  ')).rejects.toThrow();
    const { id } = await maakBord(beheerder, '  Werkplaats ');
    expect((await haalBord(id)).naam).toBe('Werkplaats');
    await expect(wijzigBord(beheerder, id, { naam: '', gearchiveerd: false })).rejects.toThrow();
  });

  it('bordInTx sluit gearchiveerde en onbekende borden uit', async () => {
    const { id } = await maakBord(beheerder, 'Werkplaats');
    expect(await transactie((tx) => bordInTx(tx, id))).toEqual({ id });
    await wijzigBord(beheerder, id, { naam: 'Werkplaats', gearchiveerd: true });
    await expect(transactie((tx) => bordInTx(tx, id))).rejects.toBeInstanceOf(NietGevonden);
    await expect(transactie((tx) => bordInTx(tx, randomUUID()))).rejects.toBeInstanceOf(NietGevonden);
    await expect(transactie((tx) => bordInTx(tx, 'onzin'))).rejects.toBeInstanceOf(NietGevonden);
  });
});

describe('medewerkers', () => {
  it('maakt een medewerker met activatie en toont de status', async () => {
    const { id, activatie } = await maakMedewerker(beheerder, { naam: 'Piet', gebruikersnaam: 'Piet' });
    expect(activatie.code).toMatch(/^\d{6}$/);
    const lijst = await lijstMedewerkers(beheerder);
    expect(lijst).toHaveLength(1);
    expect(lijst[0]).toMatchObject({ id, naam: 'Piet', gebruikersnaam: 'piet', actief: true, geactiveerd: false });
    expect(lijst[0].activatieVerlooptOp).toBeInstanceOf(Date);
    await activeerMetToken(activatie.token, 'piet-wachtwoord');
    expect((await lijstMedewerkers(beheerder))[0].geactiveerd).toBe(true);
  });

  it('toont alleen medewerkers, gesorteerd op naam', async () => {
    await maakMedewerker(beheerder, { naam: 'Piet', gebruikersnaam: 'piet' });
    await maakMedewerker(beheerder, { naam: 'Anna', gebruikersnaam: 'anna' });
    expect((await lijstMedewerkers(beheerder)).map((m) => m.naam)).toEqual(['Anna', 'Piet']);
  });

  it('weigert een dubbele gebruikersnaam', async () => {
    await maakMedewerker(beheerder, { naam: 'Piet', gebruikersnaam: 'piet' });
    await expect(maakMedewerker(beheerder, { naam: 'Piet 2', gebruikersnaam: 'piet' }))
      .rejects.toEqual(new Ongeldig('Deze gebruikersnaam is al in gebruik.'));
  });

  it('deactiveren beëindigt sessies; een nieuwe link werkt opnieuw', async () => {
    const { id, activatie } = await maakMedewerker(beheerder, { naam: 'Piet', gebruikersnaam: 'piet' });
    await activeerMetToken(activatie.token, 'piet-wachtwoord');
    const sessie = await maakSessie(id);
    expect(await gebruikerVoorSessie(sessie.token)).not.toBeNull();
    await zetActief(beheerder, id, false);
    expect(await gebruikerVoorSessie(sessie.token)).toBeNull();
    await zetActief(beheerder, id, true);
    const nieuw = await nieuweActivatie(beheerder, id);
    expect((await activeerMetToken(nieuw.token, 'ander-wachtwoord')).ok).toBe(true);
  });

  it('geeft NietGevonden voor een onbekende of ongeldige medewerker, en voor de beheerder', async () => {
    await expect(nieuweActivatie(beheerder, 'onzin')).rejects.toBeInstanceOf(NietGevonden);
    await expect(nieuweActivatie(beheerder, randomUUID())).rejects.toBeInstanceOf(NietGevonden);
    await expect(zetActief(beheerder, randomUUID(), false)).rejects.toBeInstanceOf(NietGevonden);
    await expect(zetActief(beheerder, beheerder.gebruikerId, false)).rejects.toBeInstanceOf(NietGevonden);
    await expect(verwijderMedewerker(beheerder, 'onzin')).rejects.toBeInstanceOf(NietGevonden);
    await expect(verwijderMedewerker(beheerder, randomUUID())).rejects.toBeInstanceOf(NietGevonden);
    await expect(verwijderMedewerker(beheerder, beheerder.gebruikerId)).rejects.toBeInstanceOf(NietGevonden);
  });

  it('verwijderen wist de medewerker en zijn sessies; zijn taken en historie blijven zonder naam', async () => {
    const piet = await maakMedewerkerCtx('piet', 'Piet');
    const sessie = await maakSessie(piet.gebruikerId);
    const bordId = await maakTestbord('Takenbord');
    const velden = { titel: 'Banden wisselen', omschrijving: '', datum: '2026-10-22', tijd: null, prioriteit: 'middel' as const };
    const { id: taakId } = await maakTaak(piet, { bordId, herhaling: null, ...velden });
    await wijzigTaak(piet, taakId, 1, { ...velden, prioriteit: 'hoog' });

    await verwijderMedewerker(beheerder, piet.gebruikerId);

    expect(await lijstMedewerkers(beheerder)).toEqual([]);
    expect(await gebruikerVoorSessie(sessie.token)).toBeNull();
    expect((await haalTaak(taakId)).gewijzigdDoorNaam).toBeNull();
    expect((await taakHistorie(taakId)).map((h) => h.naam)).toEqual([null]);
    const opnieuw = await maakMedewerker(beheerder, { naam: 'Piet', gebruikersnaam: 'piet' });
    expect(opnieuw.id).not.toBe(piet.gebruikerId);
  });
});
