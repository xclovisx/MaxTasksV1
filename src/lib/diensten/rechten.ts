import type { Context } from '../context';
import { GeenToegang } from '../fouten';

export function vereisBeheerder(ctx: Context): void {
  if (ctx.rol !== 'beheerder') throw new GeenToegang('Alleen de beheerder kan dit doen.');
}
