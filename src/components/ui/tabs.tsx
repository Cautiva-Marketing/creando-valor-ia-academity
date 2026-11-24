'use client';

import { Tabs as TabsPrimitive } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        'inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-lg bg-surface-sunken p-1',
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        'inline-flex min-h-touch items-center justify-center rounded-md px-4 text-base font-medium whitespace-nowrap text-text-muted',
        'hover:text-text disabled:cursor-not-allowed disabled:opacity-60',
        'data-[state=active]:bg-surface-raised data-[state=active]:text-text data-[state=active]:shadow-sm',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content data-slot="tabs-content" className={cn('pt-4', className)} {...props} />
  );
}
