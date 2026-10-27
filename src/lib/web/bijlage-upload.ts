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

/** XHR in plaats van fetch: alleen zo is de voortgang van een upload te volgen. */
export function uploadBijlage(taakId: string, bestand: Blob, naam: string, opVoortgang: (fractie: number) => void): Promise<UploadResultaat> {
  return new Promise((klaar) => {
    const fd = new FormData();
    fd.append('bestand', bestand, naam);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/taken/${encodeURIComponent(taakId)}/bijlagen`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) opVoortgang(e.loaded / e.total); };
    xhr.onload = () => {
      let data: unknown = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* geen JSON */ }
      if (xhr.status === 201) klaar({ ok: true, bijlage: data as Bijlage });
      else klaar({ ok: false, fout: (data as { fout?: string } | null)?.fout ?? `Uploaden mislukt (${xhr.status}).` });
    };
    xhr.onerror = () => klaar({ ok: false, fout: 'Geen verbinding. Probeer het opnieuw.' });
    xhr.send(fd);
  });
}
