'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export function LiveVernieuwen({ bron }: { bron: string }) {
  const router = useRouter();
  useEffect(() => {
    const es = new EventSource(bron);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let eerderVerbonden = false;
    const vernieuw = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 150);
    };
    es.onopen = () => {
      if (eerderVerbonden) vernieuw(); // na herverbinden: alles opnieuw ophalen
      eerderVerbonden = true;
    };
    es.onmessage = vernieuw;
    return () => {
      clearTimeout(timer);
      es.close();
    };
  }, [bron, router]);
  return null;
}
