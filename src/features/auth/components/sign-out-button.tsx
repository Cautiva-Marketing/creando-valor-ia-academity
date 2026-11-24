'use client';

import { LogOut } from 'lucide-react';
import { useFormStatus } from 'react-dom';
import { Button, type ButtonProps } from '@/components/ui/button';
import { signOut } from '../actions';

function SubmitButton(props: ButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} {...props}>
      {pending ? null : <LogOut aria-hidden="true" />}
      Cerrar sesión
    </Button>
  );
}

export function SignOutButton(props: ButtonProps) {
  return (
    <form action={signOut}>
      <SubmitButton variant="ghost" {...props} />
    </form>
  );
}
