export class Fout extends Error {}

export class NietGevonden extends Fout {
  constructor(bericht = 'Niet gevonden') { super(bericht); }
}

export class GeenToegang extends Fout {
  constructor(bericht = 'Geen toegang') { super(bericht); }
}

export class Ongeldig extends Fout {}

export class Conflict extends Fout {
  readonly doorNaam: string | null;
  constructor(doorNaam: string | null) {
    super(`Deze taak is zojuist gewijzigd door ${doorNaam ?? 'iemand anders'}. Herladen?`);
    this.doorNaam = doorNaam;
  }
}
