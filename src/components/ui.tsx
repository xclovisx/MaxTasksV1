import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type KnopVariant = 'primair' | 'secundair' | 'gevaar' | 'stil';

const KNOP: Record<KnopVariant, string> = {
  primair: 'bg-accent text-accent-donker hover:bg-accent/90',
  secundair: 'border border-rand bg-kaart text-tekst hover:bg-kaart-hover',
  gevaar: 'border border-prio-nu/50 text-fout hover:bg-prio-nu/10',
  stil: 'text-tekst-zacht hover:bg-kaart hover:text-tekst',
};

export function Knop({ variant = 'primair', className, ...rest }: ComponentProps<'button'> & { variant?: KnopVariant }) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3.5 text-sm font-semibold transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50',
        KNOP[variant],
        className,
      )}
    />
  );
}

const VELD =
  'w-full rounded-lg border border-rand bg-achtergrond px-3 text-sm text-tekst placeholder:text-tekst-flauw ' +
  'focus:border-accent focus:outline-none disabled:opacity-50';

export function Invoer({ className, ...rest }: ComponentProps<'input'>) {
  return <input {...rest} className={cn(VELD, 'h-9', className)} />;
}

export function Tekstvak({ className, ...rest }: ComponentProps<'textarea'>) {
  return <textarea {...rest} className={cn(VELD, 'py-2', className)} />;
}

export function Keuzelijst({ className, ...rest }: ComponentProps<'select'>) {
  return <select {...rest} className={cn(VELD, 'h-9', className)} />;
}

export function Veld({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-tekst-zacht">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-tekst-flauw">{hint}</span>}
    </label>
  );
}

export function Paneel({ titel, acties, className, children }: { titel?: string; acties?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section aria-label={titel} className={cn('rounded-xl border border-rand-zacht bg-paneel p-4', className)}>
      {titel && (
        <header className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{titel}</h2>
          {acties}
        </header>
      )}
      {children}
    </section>
  );
}

export function Melding({ soort = 'fout', children }: { soort?: 'fout' | 'info'; children: ReactNode }) {
  return (
    <p
      role={soort === 'fout' ? 'alert' : 'status'}
      className={cn('rounded-lg px-3 py-2 text-sm', soort === 'fout' ? 'bg-prio-nu/10 text-fout' : 'bg-kaart text-tekst-zacht')}
    >
      {children}
    </p>
  );
}
