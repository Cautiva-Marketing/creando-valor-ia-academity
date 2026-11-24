'use client';

import { Eye, EyeOff } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { Input } from './input';

/** Password input with an accessible show/hide toggle. */
export function PasswordInput({
  className,
  ...props
}: Omit<React.ComponentProps<'input'>, 'type'>) {
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="relative">
      <Input type={visible ? 'text' : 'password'} className={cn('pr-12', className)} {...props} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 inline-flex w-touch items-center justify-center rounded-r-md text-text-muted hover:text-text focus-visible:outline-3 focus-visible:outline-focus-ring"
      >
        {visible ? (
          <EyeOff className="size-5" aria-hidden="true" />
        ) : (
          <Eye className="size-5" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
