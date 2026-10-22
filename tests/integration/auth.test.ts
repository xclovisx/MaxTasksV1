import { beforeEach, describe, expect, it } from 'vitest';
import { wijzigEigenWachtwoord } from '../../src/lib/auth/accounts';
import { activatieVoorToken, activeerMetCode, activeerMetToken, geefActivatie, ONGELDIGE_ACTIVATIE } from '../../src/lib/auth/activatie';
import { inloggen } from '../../src/lib/auth/inloggen';
import { gebruikerVoorSessie, maakSessie, verwijderSessie } from '../../src/lib/auth/sessies';
import type { Context } from '../../src/lib/context';
import { db, transactie } from '../../src/lib/db/client';
import { leegDatabase, maakBeheerderCtx, maakMedewerkerCtx } from './helpers';

let beheerder: Context;
let piet: Context;

beforeEach(async () => {
  await leegDatabase();
  beheerder = await maakBeheerderCtx();
  piet = await maakMedewerkerCtx('piet', 'Piet', 'juist-wachtwoord');
});

const nieuweActivatie = () => transactie((tx) => geefActivatie(tx, piet.gebruikerId));

describe('inloggen', () => {
  it('slaagt met het juiste wachtwoord, ook met hoofdletters in de gebruikersnaam', async () => {
    expect(await inloggen(' Piet ', 'juist-wachtwoord')).toEqual({ ok: true, gebruikerId: piet.gebruikerId });
  });

  it('geeft dezelfde melding bij onbekende gebruiker en fout wachtwoord', async () => {
    const fout = { ok: false, fout: 'Gebruikersnaam of wachtwoord onjuist.' };
    expect(await inloggen('onbekend', 'x')).toEqual(fout);
    expect(await inloggen('piet', 'fout')).toEqual(fout);
  });

  it('blokkeert na 5 mislukte pogingen, ook met het juiste wachtwoord', async () => {
    for (let i = 0; i < 5; i++) await inloggen('piet', 'fout');
    expect(await inloggen('piet', 'juist-wachtwoord')).toEqual({ ok: false, fout: expect.stringMatching(/^Te veel mislukte pogingen/) });
  });

  it('laat weer toe als de blokkade voorbij is', async () => {
    for (let i = 0; i < 5; i++) await inloggen('piet', 'fout');
    await db()`update gebruikers set geblokkeerd_tot = now() - interval '1 minute' where id = ${piet.gebruikerId}`;
    expect((await inloggen('piet', 'juist-wachtwoord')).ok).toBe(true);
  });

  it('weigert een gedeactiveerd account', async () => {
    await db()`update gebruikers set actief = false where id = ${piet.gebruikerId}`;
    expect((await inloggen('piet', 'juist-wachtwoord')).ok).toBe(false);
  });
});

describe('sessies', () => {
  it('maakt, leest en verwijdert een sessie', async () => {
    const { token, verlooptOp } = await maakSessie(piet.gebruikerId);
    expect(verlooptOp.getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 3600_000);
    expect(await gebruikerVoorSessie(token)).toEqual({
      id: piet.gebruikerId, naam: 'Piet', gebruikersnaam: 'piet', rol: 'medewerker',
    });
    await verwijderSessie(token);
    expect(await gebruikerVoorSessie(token)).toBeNull();
  });

  it('negeert verlopen sessies en sessies van gedeactiveerde gebruikers', async () => {
    const a = await maakSessie(piet.gebruikerId);
    await db()`update sessies set verloopt_op = now() - interval '1 second'`;
    expect(await gebruikerVoorSessie(a.token)).toBeNull();
    const b = await maakSessie(piet.gebruikerId);
    await db()`update gebruikers set actief = false where id = ${piet.gebruikerId}`;
    expect(await gebruikerVoorSessie(b.token)).toBeNull();
  });
});

describe('activatie', () => {
  it('maakt het oude wachtwoord en alle sessies ongeldig', async () => {
    const sessie = await maakSessie(piet.gebruikerId);
    await nieuweActivatie();
    expect(await gebruikerVoorSessie(sessie.token)).toBeNull();
    expect((await inloggen('piet', 'juist-wachtwoord')).ok).toBe(false);
  });

  it('activeert eenmalig met de link', async () => {
    const { token } = await nieuweActivatie();
    expect(await activatieVoorToken(token)).toEqual({ naam: 'Piet' });
    expect(await activeerMetToken(token, 'kort')).toEqual({ ok: false, fout: 'Kies een wachtwoord van minstens 8 tekens.' });
    expect(await activeerMetToken(token, 'nieuw-wachtwoord')).toEqual({ ok: true, gebruikerId: piet.gebruikerId });
    expect((await inloggen('piet', 'nieuw-wachtwoord')).ok).toBe(true);
    expect(await activeerMetToken(token, 'nog-een-wachtwoord')).toEqual({ ok: false, fout: ONGELDIGE_ACTIVATIE });
    expect(await activatieVoorToken(token)).toBeNull();
  });

  it('weigert een verlopen link', async () => {
    const { token } = await nieuweActivatie();
    await db()`update gebruikers set activatie_verloopt_op = now() - interval '1 minute'`;
    expect(await activeerMetToken(token, 'nieuw-wachtwoord')).toEqual({ ok: false, fout: ONGELDIGE_ACTIVATIE });
  });

  it('activeert met gebruikersnaam en code; foute codes tellen mee voor de blokkade', async () => {
    const { code } = await nieuweActivatie();
    const fout = code === '000000' ? '111111' : '000000';
    expect(await activeerMetCode('piet', fout, 'nieuw-wachtwoord')).toEqual({ ok: false, fout: 'Activatiecode onjuist.' });
    expect(await activeerMetCode('piet', code, 'nieuw-wachtwoord')).toEqual({ ok: true, gebruikerId: piet.gebruikerId });

    const tweede = await nieuweActivatie();
    const fout2 = tweede.code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await activeerMetCode('piet', fout2, 'nieuw-wachtwoord');
    expect(await activeerMetCode('piet', tweede.code, 'nieuw-wachtwoord'))
      .toEqual({ ok: false, fout: expect.stringMatching(/^Te veel mislukte pogingen/) });
  });
});

describe('wijzigEigenWachtwoord', () => {
  it('wijzigt alleen met het juiste huidige wachtwoord', async () => {
    await expect(wijzigEigenWachtwoord(piet.gebruikerId, 'fout', 'nieuw-wachtwoord')).rejects.toThrow('Huidig wachtwoord onjuist.');
    await expect(wijzigEigenWachtwoord(piet.gebruikerId, 'juist-wachtwoord', 'kort')).rejects.toThrow(/minstens 8/);
    await wijzigEigenWachtwoord(piet.gebruikerId, 'juist-wachtwoord', 'nieuw-wachtwoord');
    expect((await inloggen('piet', 'nieuw-wachtwoord')).ok).toBe(true);
  });
});
