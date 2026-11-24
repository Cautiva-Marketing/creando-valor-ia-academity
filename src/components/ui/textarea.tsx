'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { fieldControlClass } from './input';

/**
 * Auto-growing textarea: CSS `field-sizing: content` where supported, JS fallback otherwise.
 */
export function Textarea({ className, onInput, ...props }: React.ComponentProps<'textarea'>) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const supportsFieldSizing =
    typeof CSS !== 'undefined' && CSS.supports?.('field-sizing', 'content');

  const resize = React.useCallback(() => {
    const el = ref.current;
    if (!el || supportsFieldSizing) return;
    el.style.height = 'auto';
    // JS fallback for field-sizing: the height is measured content, not a design value.
    el.style.height = `${el.scrollHeight}px`;
  }, [supportsFieldSizing]);

  React.useLayoutEffect(resize, [resize, props.value]);

  return (
    <textarea
      ref={ref}
      data-slot="textarea"
      className={cn(fieldControlClass, 'field-sizing-content min-h-24 resize-y py-2', className)}
      onInput={(event) => {
        resize();
        onInput?.(event);
      }}
      {...props}
    />
  );
}
