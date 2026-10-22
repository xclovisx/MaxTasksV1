'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

const LINKS = [
  ['/beheer/instellingen', 'Instellingen'],
  ['/beheer/borden', 'Borden'],
  ['/beheer/medewerkers', 'Medewerkers'],
] as const;

export function BeheerNav() {
  const pad = usePathname();
  return (
    <nav className="mt-4 flex gap-1 overflow-x-auto border-b border-rand-zacht" aria-label="Beheer">
      {LINKS.map(([href, label]) => (
        <Link
          key={href}
          href={href}
          aria-current={pad === href ? 'page' : undefined}
          className={cn(
            '-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors',
            pad === href ? 'border-accent text-tekst' : 'border-transparent text-tekst-zacht hover:text-tekst',
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
