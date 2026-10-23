import { DAGNAMEN, type Datum, kortDatumLabel, weekdag } from './datums';
import { PRIORITEIT_LABEL, PRIORITEITEN, type Prioriteit } from './taak';

export type NtfyBericht = { titel: string; tekst: string; prioriteit: 4 | 5; tags: string[]; link: string };

const URGENT: Prioriteit[] = ['zsm', 'nu'];

/** Melden bij een nieuwe taak met zsm/nu, of als de prioriteit daarnaar omhoog gaat (ook zsm → nu). */
export function isUrgentVerhoogd(oud: Prioriteit | null, nieuw: Prioriteit): boolean {
  if (!URGENT.includes(nieuw)) return false;
  return oud === null || PRIORITEITEN.indexOf(nieuw) < PRIORITEITEN.indexOf(oud);
}

export function urgentBericht(
  t: { titel: string; prioriteit: Prioriteit; bordNaam: string; datum: Datum; tijd: string | null },
  appUrl: string,
): NtfyBericht {
  const nu = t.prioriteit === 'nu';
  return {
    titel: `${PRIORITEIT_LABEL[t.prioriteit]}: ${t.titel}`,
    tekst: `${t.bordNaam} · ${DAGNAMEN[weekdag(t.datum)]} ${kortDatumLabel(t.datum)}${t.tijd ? ` om ${t.tijd}` : ''}`,
    prioriteit: nu ? 5 : 4,
    tags: [nu ? 'rotating_light' : 'warning'],
    link: `${appUrl.replace(/\/+$/, '')}/vandaag?datum=${t.datum}`,
  };
}
