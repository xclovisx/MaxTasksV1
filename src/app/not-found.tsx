import Link from 'next/link';

export default function NietGevondenPagina() {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-lg font-semibold">Niet gevonden</h1>
      <p className="mt-2 text-sm text-tekst-zacht">Deze pagina bestaat niet, of je hebt er geen toegang toe.</p>
      <Link href="/" className="mt-6 inline-block text-sm underline underline-offset-4">Naar de startpagina</Link>
    </div>
  );
}
