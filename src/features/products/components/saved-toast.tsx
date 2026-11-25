'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { toast } from '@/components/ui/sonner';

/** Toast after a redirect (`?guardado=creado`), then removes the flag from the URL. */
export function SavedToast({ messages }: { messages: Record<string, string> }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const shown = useRef(false);
  const flag = params.get('guardado');

  useEffect(() => {
    if (!flag || shown.current) return;
    const message = messages[flag];
    if (message) toast.success(message);
    shown.current = true;
    const next = new URLSearchParams(params);
    next.delete('guardado');
    router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [flag, messages, params, pathname, router]);

  return null;
}
