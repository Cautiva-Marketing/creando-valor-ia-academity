'use client';

import { MotionConfig } from 'motion/react';
import { ThemeProvider } from 'next-themes';
import { Toaster } from '@/components/ui/sonner';

/**
 * Theme without flicker (research.md §R16): class strategy, system default, preference stored per
 * device; the inline script carries the CSP nonce. Motion respects prefers-reduced-motion.
 */
export function Providers({ children, nonce }: { children: React.ReactNode; nonce?: string }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      themes={['light', 'dark']}
      nonce={nonce}
    >
      <MotionConfig reducedMotion="user">
        {children}
        <Toaster />
      </MotionConfig>
    </ThemeProvider>
  );
}
