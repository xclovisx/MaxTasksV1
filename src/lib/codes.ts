import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { prepareZXingModule, readBarcodes, writeBarcode } from 'zxing-wasm/full';
import { CODE_FORMATEN, type Code, geldigeCode, grootsteCode } from './domein/bijlagen';

// Het wasm-bestand zelf inlezen: standaard haalt zxing-wasm het van een CDN, en dat willen we op de server niet.
const WASM = path.join(process.cwd(), 'node_modules', 'zxing-wasm', 'dist', 'full', 'zxing_full.wasm');
let laden: Promise<unknown> | null = null;

export function laadZxing(): Promise<unknown> {
  laden ??= readFile(WASM).then((b) =>
    prepareZXingModule({
      overrides: { wasmBinary: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) },
      fireImmediately: true,
    }),
  ).catch((e) => {
    laden = null; // bij een volgende poging opnieuw proberen
    throw e;
  });
  return laden;
}

/** Zoekt de grootste QR- of streepjescode in een foto. Gooit nooit: zonder (geldige) code komt er null terug. */
export async function herkenCode(bytes: Uint8Array): Promise<Code | null> {
  try {
    await laadZxing();
    const resultaten = (await readBarcodes(bytes, { formats: [...CODE_FORMATEN], tryHarder: true }))
      .map((r) => ({ r, code: geldigeCode(r) }))
      .filter((x): x is { r: (typeof x)['r']; code: Code } => x.code !== null);
    return grootsteCode(resultaten.map((x) => ({ ...x, position: x.r.position })))?.code ?? null;
  } catch (e) {
    console.error('[codes] herkennen mislukt', e);
    return null;
  }
}

/** Tekent de code als SVG; met viewBox, zodat hij in een <img> meeschaalt. */
export async function tekenCode(code: Code): Promise<string> {
  await laadZxing();
  const w = await writeBarcode(code.tekst, { format: code.formaat });
  if (w.error) throw new Error(`Code tekenen mislukt: ${w.error}`);
  const svg = w.svg.replace(/<svg width="(\d+)" height="(\d+)"/, '<svg width="$1" height="$2" viewBox="0 0 $1 $2"');
  if (svg === w.svg) throw new Error('Code tekenen mislukt: SVG heeft geen verwachte width/height');
  return svg;
}
