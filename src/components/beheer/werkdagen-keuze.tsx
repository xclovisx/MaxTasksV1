import { DAGNAMEN_KORT } from '@/lib/domein/datums';

export function WerkdagenKeuze({ gekozen = [1, 2, 3, 4, 5] }: { gekozen?: number[] }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-xs font-medium text-tekst-zacht">Werkdagen</legend>
      <div className="flex flex-wrap gap-1.5">
        {[1, 2, 3, 4, 5, 6, 7].map((d) => (
          <label key={d} className="cursor-pointer">
            <input type="checkbox" name="werkdagen" value={d} defaultChecked={gekozen.includes(d)} className="peer sr-only" />
            <span className="inline-flex h-8 w-10 items-center justify-center rounded-lg border border-rand text-xs text-tekst-zacht peer-checked:border-accent peer-checked:bg-accent/15 peer-checked:text-tekst peer-focus-visible:outline-2 peer-focus-visible:outline-accent">
              {DAGNAMEN_KORT[d]}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
