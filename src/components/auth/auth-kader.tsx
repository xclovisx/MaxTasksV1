import type { ReactNode } from 'react';

export function AuthKader({ titel, ondertitel, children }: { titel: string; ondertitel?: string; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <span className="inline-flex items-center gap-2 text-sm font-bold tracking-tight">
            <span className="size-2.5 rounded-sm bg-accent" />
            Takenbord
          </span>
        </div>
        <div className="rounded-2xl border border-rand-zacht bg-paneel p-6 shadow-xl shadow-black/30">
          <h1 className="text-lg font-semibold">{titel}</h1>
          {ondertitel && <p className="mt-1 text-sm text-tekst-zacht">{ondertitel}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </main>
  );
}
