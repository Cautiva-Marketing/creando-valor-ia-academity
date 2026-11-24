import { requireSuperadmin } from '@/lib/auth/guards';

/** /design is superadmin-only, verified on the server (FR-044); others get "sin permiso" (403). */
export default async function DesignLayout({ children }: { children: React.ReactNode }) {
  await requireSuperadmin('/design');
  return children;
}
