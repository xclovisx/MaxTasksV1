import { writeBarcode } from 'zxing-wasm/full';
import type { CodeFormaat } from '../src/lib/domein/bijlagen';
import { laadZxing } from '../src/lib/codes';

/** Maakt een PNG met een echte code, om herkennen te testen. */
export async function codePng(formaat: CodeFormaat, tekst: string, scale = 6): Promise<Uint8Array> {
  await laadZxing();
  const w = await writeBarcode(tekst, { format: formaat, scale });
  if (w.error || !w.image) throw new Error(`codePng: ${w.error || 'geen afbeelding'}`);
  return new Uint8Array(await w.image.arrayBuffer());
}
