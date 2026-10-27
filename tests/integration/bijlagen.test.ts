import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Context } from '../../src/lib/context';
import { haalBijlage, verwijderBijlage, voegBijlageToe } from '../../src/lib/diensten/bijlagen';
import { haalTaak, maakTaak, taakHistorie, verwijderTaak } from '../../src/lib/diensten/taken';
import { MAX_BIJLAGE_BYTES } from '../../src/lib/domein/bijlagen';
import { NietGevonden, OpslagOntbreekt, Ongeldig, TeGroot, TeVeelBijlagen } from '../../src/lib/fouten';
import { OPSLAG_MARKER } from '../../src/lib/opslag';
import { leegDatabase, maakBord, maakMedewerkerCtx } from './helpers';

export const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const PDF = new TextEncoder().encode('%PDF-1.4 test');

let map: string;
let piet: Context;
let taakId: string;

const bestanden = async () => (await readdir(map)).filter((n) => n !== OPSLAG_MARKER).sort();

beforeEach(async () => {
  await leegDatabase();
  map = await mkdtemp(path.join(tmpdir(), 'takenbord-bijlagen-'));
  process.env.BIJLAGEN_MAP = map;
  delete process.env.OPSLAG_CONTROLE;
  piet = await maakMedewerkerCtx('piet', 'Piet');
  const bordId = await maakBord();
  ({ id: taakId } = await maakTaak(piet, {
    bordId, herhaling: null, titel: 'Pakket ophalen', omschrijving: '', datum: '2026-10-27', tijd: null, prioriteit: 'middel',
  }));
});

afterEach(async () => {
  delete process.env.BIJLAGEN_MAP;
  delete process.env.OPSLAG_CONTROLE;
  await rm(map, { recursive: true, force: true });
});

describe('bijlagen', () => {
  it('voegt een bijlage toe: bestand op schijf, zichtbaar bij de taak en in de historie', async () => {
    const b = await voegBijlageToe(piet, taakId, { naam: 'C:\\fakepath\\qr.png', inhoud: PNG });
    expect(b).toEqual({ id: expect.any(String), naam: 'qr.png', type: 'image/png', grootte: PNG.length });
    expect(await bestanden()).toEqual([b.id]);
    expect(new Uint8Array(await readFile(path.join(map, b.id)))).toEqual(PNG);
    expect((await haalTaak(taakId)).bijlagen).toEqual([b]);
    expect((await taakHistorie(taakId))[0]).toMatchObject({ naam: 'Piet', wijzigingen: { bijlage: { oud: null, nieuw: 'qr.png' } } });
    expect(await haalBijlage(b.id)).toEqual({ naam: 'qr.png', type: 'image/png', pad: path.join(map, b.id) });
  });

  it('bepaalt het type uit de inhoud, niet uit de naam', async () => {
    const b = await voegBijlageToe(piet, taakId, { naam: 'label.png', inhoud: PDF });
    expect(b.type).toBe('application/pdf');
  });

  it('verwijdert rij en bestand en schrijft historie', async () => {
    const b = await voegBijlageToe(piet, taakId, { naam: 'qr.png', inhoud: PNG });
    await verwijderBijlage(piet, b.id);
    expect(await bestanden()).toEqual([]);
    expect((await haalTaak(taakId)).bijlagen).toEqual([]);
    expect((await taakHistorie(taakId))[0].wijzigingen).toEqual({ bijlage: { oud: 'qr.png', nieuw: null } });
    await expect(verwijderBijlage(piet, b.id)).rejects.toBeInstanceOf(NietGevonden);
    await expect(verwijderBijlage(piet, 'onzin')).rejects.toBeInstanceOf(NietGevonden);
  });

  it('staat maximaal 10 bijlagen per taak toe', async () => {
    for (let i = 0; i < 10; i++) await voegBijlageToe(piet, taakId, { naam: `f${i}.png`, inhoud: PNG });
    await expect(voegBijlageToe(piet, taakId, { naam: 'elf.png', inhoud: PNG }))
      .rejects.toEqual(new TeVeelBijlagen('Maximaal 10 bijlagen per taak.'));
    expect(await bestanden()).toHaveLength(10);
  });

  it('weigert te groot, leeg en een onbekend type zonder iets te schrijven', async () => {
    const groot = new Uint8Array(MAX_BIJLAGE_BYTES + 1);
    groot.set(PNG);
    await expect(voegBijlageToe(piet, taakId, { naam: 'groot.png', inhoud: groot })).rejects.toEqual(new TeGroot('Te groot (max 10 MB).'));
    await expect(voegBijlageToe(piet, taakId, { naam: 'leeg.png', inhoud: new Uint8Array() })).rejects.toBeInstanceOf(Ongeldig);
    await expect(voegBijlageToe(piet, taakId, { naam: 'x.gif', inhoud: new TextEncoder().encode('GIF89a') }))
      .rejects.toEqual(new Ongeldig("Dit bestandstype kan niet (alleen foto's en PDF's)."));
    expect(await bestanden()).toEqual([]);
  });

  it('een onbekende taak geeft NietGevonden en laat geen bestand achter', async () => {
    await expect(voegBijlageToe(piet, randomUUID(), { naam: 'qr.png', inhoud: PNG })).rejects.toBeInstanceOf(NietGevonden);
    await expect(voegBijlageToe(piet, 'onzin', { naam: 'qr.png', inhoud: PNG })).rejects.toBeInstanceOf(NietGevonden);
    expect(await bestanden()).toEqual([]);
  });

  it('een taak verwijderen haalt de rijen weg (het bestand ruimt de nachtrun op)', async () => {
    const b = await voegBijlageToe(piet, taakId, { naam: 'qr.png', inhoud: PNG });
    await verwijderTaak(piet, taakId);
    await expect(haalBijlage(b.id)).rejects.toBeInstanceOf(NietGevonden);
  });

  describe('opslagcontrole', () => {
    it('zonder controlebestand: OpslagOntbreekt en er wordt niets aangemaakt', async () => {
      const sub = path.join(map, 'schijf');
      process.env.BIJLAGEN_MAP = sub;
      process.env.OPSLAG_CONTROLE = '1';
      await expect(voegBijlageToe(piet, taakId, { naam: 'qr.png', inhoud: PNG })).rejects.toEqual(new OpslagOntbreekt());
      expect(await readdir(map)).toEqual([]);
    });

    it('met controlebestand werkt het gewoon', async () => {
      process.env.OPSLAG_CONTROLE = '1';
      await writeFile(path.join(map, OPSLAG_MARKER), '');
      const b = await voegBijlageToe(piet, taakId, { naam: 'qr.png', inhoud: PNG });
      expect(await bestanden()).toEqual([b.id]);
    });

    it('zonder controle wordt een ontbrekende map aangemaakt', async () => {
      process.env.BIJLAGEN_MAP = path.join(map, 'nieuw', 'bijlagen');
      const b = await voegBijlageToe(piet, taakId, { naam: 'qr.png', inhoud: PNG });
      expect(await readdir(path.join(map, 'nieuw', 'bijlagen'))).toEqual([b.id]);
    });
  });
});
