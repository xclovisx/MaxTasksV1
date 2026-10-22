'use client';

export default function Foutpagina({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-lg font-semibold">Er ging iets mis</h1>
      <p className="mt-2 text-sm text-tekst-zacht">Probeer het opnieuw. Blijft het misgaan, laat het de beheerder weten.</p>
      <button type="button" onClick={reset} className="mt-6 rounded-lg border border-rand bg-kaart px-4 py-2 text-sm hover:bg-kaart-hover">
        Opnieuw proberen
      </button>
    </div>
  );
}
