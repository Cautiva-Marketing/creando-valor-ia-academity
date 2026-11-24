import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/** tailwind-merge aware of the project's token scales (research.md §R14). */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl'] }],
      'text-color': [
        {
          text: [
            'primary',
            'on-primary',
            'accent',
            'on-accent',
            'accent-strong',
            'success',
            'on-success',
            'warning',
            'on-warning',
            'danger',
            'on-danger',
            'info',
            'on-info',
            'text',
            'text-muted',
            'on-avatar-1',
            'on-avatar-2',
            'on-avatar-3',
            'on-avatar-4',
            'on-avatar-5',
            'on-avatar-6',
          ],
        },
      ],
      shadow: [{ shadow: ['sm', 'md', 'lg', 'none'] }],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
