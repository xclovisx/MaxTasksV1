import {
  alsJpgNaam, type Bijlage, magOngewijzigd, MAX_BIJLAGE_BYTES, MAX_ZIJDE, plakNaam, soortVerwerking,
} from '../domein/bijlagen';

const TE_GROOT = 'Te groot (max 10 MB).';

async function verkleinNaarJpg(f: Blob): Promise<Blob> {
  const beeld = await createImageBitmap(f);
  const schaal = Math.min(1, MAX_ZIJDE / Math.max(beeld.width, beeld.height));
  const breedte = Math.max(1, Math.round(beeld.width * schaal));
  const hoogte = Math.max(1, Math.round(beeld.height * schaal));
  const canvas = document.createElement('canvas');
  canvas.width = breedte;
  canvas.height = hoogte;
  const c = canvas.getContext('2d');
  if (!c) throw new Error('Geen canvas');
  c.fillStyle = '#fff'; // transparante PNG's krijgen een witte achtergrond, zodat een QR-code leesbaar blijft
  c.fillRect(0, 0, breedte, hoogte);
  c.drawImage(beeld, 0, 0, breedte, hoogte);
  beeld.close();
  return new Promise((klaar, faal) => canvas.toBlob((b) => (b ? klaar(b) : faal(new Error('toBlob mislukt'))), 'image/jpeg', 0.85));
}

/** Maakt een gekozen of geplakt bestand klaar voor upload: foto's verkleind naar JPEG (zonder EXIF), PDF's ongewijzigd. */
export async function bereidVoor(f: File, nu: Date = new Date()): Promise<{ bestand: Blob; naam: string } | { fout: string }> {
  const naam = f.name && f.name !== 'image.png' ? f.name : plakNaam(nu);
  const soort = soortVerwerking(f.type);
  if (soort === 'weiger') return { fout: "Dit bestandstype kan niet (alleen foto's en PDF's)." };
  if (soort === 'ongewijzigd') return f.size > MAX_BIJLAGE_BYTES ? { fout: TE_GROOT } : { bestand: f, naam };
  try {
    const jpg = await verkleinNaarJpg(f);
    return jpg.size > MAX_BIJLAGE_BYTES ? { fout: TE_GROOT } : { bestand: jpg, naam: alsJpgNaam(naam) };
  } catch {
    if (!magOngewijzigd(f.type)) return { fout: 'Dit fototype kan niet.' };
    return f.size > MAX_BIJLAGE_BYTES ? { fout: TE_GROOT } : { bestand: f, naam };
  }
}

export type UploadResultaat = { ok: true; bijlage: Bijlage } | { ok: false; fout: string };

const GEEN_VERBINDING = 'Geen verbinding. Probeer het opnieuw.';
const AFGEBROKEN = 'Uploaden afgebroken. Probeer het opnieuw.';

function alsCode(c: unknown): Bijlage['code'] | undefined {
  if (c === null) return null;
  if (typeof c !== 'object') return undefined;
  const d = c as Record<string, unknown>;
  return typeof d.formaat === 'string' && typeof d.tekst === 'string' ? (c as Bijlage['code']) : undefined;
}

function alsBijlage(data: unknown): Bijlage | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  if (typeof d.id !== 'string' || typeof d.naam !== 'string' || typeof d.type !== 'string' || typeof d.grootte !== 'number') return null;
  const code = alsCode(d.code ?? null);
  if (code === undefined) return null;
  return { id: d.id, naam: d.naam, type: d.type as Bijlage['type'], grootte: d.grootte, code };
}

/** XHR in plaats van fetch: alleen zo is de voortgang van een upload te volgen. De belofte wordt altijd afgehandeld, nooit afgewezen. */
export function uploadBijlage(taakId: string, bestand: Blob, naam: string, opVoortgang: (fractie: number) => void): Promise<UploadResultaat> {
  return new Promise((klaar) => {
    try {
      const fd = new FormData();
      fd.append('bestand', bestand, naam);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api/taken/${encodeURIComponent(taakId)}/bijlagen`);
      xhr.timeout = 120_000;
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) opVoortgang(e.loaded / e.total); };
      xhr.onload = () => {
        let data: unknown = null;
        try { data = JSON.parse(xhr.responseText); } catch { /* geen JSON */ }
        if (xhr.status === 201) {
          const bijlage = alsBijlage(data);
          klaar(bijlage ? { ok: true, bijlage } : { ok: false, fout: 'Onverwacht antwoord van de server.' });
        } else {
          const fout = typeof (data as { fout?: unknown } | null)?.fout === 'string' ? (data as { fout: string }).fout : `Uploaden mislukt (${xhr.status}).`;
          klaar({ ok: false, fout });
        }
      };
      xhr.onerror = () => klaar({ ok: false, fout: GEEN_VERBINDING });
      xhr.onabort = () => klaar({ ok: false, fout: AFGEBROKEN });
      xhr.ontimeout = () => klaar({ ok: false, fout: AFGEBROKEN });
      xhr.send(fd);
    } catch {
      klaar({ ok: false, fout: GEEN_VERBINDING });
    }
  });
}
