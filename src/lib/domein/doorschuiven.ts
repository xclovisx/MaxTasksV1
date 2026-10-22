import { type Datum, eersteWerkdagVanaf } from './datums';

export type OpenTaak = { id: string; datum: Datum; herhalingId: string | null };
export type DoorschuifPlan = { verplaatsen: { id: string; naar: Datum }[]; gemist: string[] };

export function reeksSleutel(herhalingId: string, datum: Datum): string {
  return `${herhalingId}|${datum}`;
}

export function planDoorschuiven(
  taken: OpenTaak[],
  vandaag: Datum,
  werkdagen: number[],
  bezetteReeksDatums: Set<string>,
): DoorschuifPlan {
  const doel = eersteWerkdagVanaf(vandaag, werkdagen);
  const bezet = new Set(bezetteReeksDatums);
  const plan: DoorschuifPlan = { verplaatsen: [], gemist: [] };
  const achterstallig = taken
    .filter((t) => t.datum < vandaag)
    .sort((a, b) => b.datum.localeCompare(a.datum)); // nieuwste eerst
  for (const t of achterstallig) {
    if (t.herhalingId) {
      const sleutel = reeksSleutel(t.herhalingId, doel);
      if (bezet.has(sleutel)) {
        plan.gemist.push(t.id);
        continue;
      }
      bezet.add(sleutel);
    }
    plan.verplaatsen.push({ id: t.id, naar: doel });
  }
  return plan;
}
