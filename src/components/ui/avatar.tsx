import { initials } from '@/lib/initials';
import { cn } from '@/lib/utils';

const PALETTE = [
  'bg-avatar-1 text-on-avatar-1',
  'bg-avatar-2 text-on-avatar-2',
  'bg-avatar-3 text-on-avatar-3',
  'bg-avatar-4 text-on-avatar-4',
  'bg-avatar-5 text-on-avatar-5',
] as const;

/** Deterministic `avatar-n` pair from the user id (FNV-1a), so a person keeps their color. */
export function avatarTone(userId: string): (typeof PALETTE)[number] {
  let hash = 0x811c9dc5;
  for (let i = 0; i < userId.length; i++) {
    hash ^= userId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return PALETTE[(hash >>> 0) % PALETTE.length]!;
}

const sizes = { sm: 'size-8 text-xs', md: 'size-10 text-sm', lg: 'size-16 text-xl' } as const;

/** Initials avatar. Decorative by default: the name is always shown or announced next to it. */
export function Avatar({
  userId,
  name,
  size = 'md',
  className,
}: {
  userId: string;
  name: string | null | undefined;
  size?: keyof typeof sizes;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-slot="avatar"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none',
        sizes[size],
        avatarTone(userId),
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
