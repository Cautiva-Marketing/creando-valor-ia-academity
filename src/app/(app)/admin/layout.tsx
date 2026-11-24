import { requireSuperadmin } from '@/lib/auth/guards';

/** Every /admin/** screen requires a superadmin with aal2; anyone else gets HTTP 403. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireSuperadmin();
  return <>{children}</>;
}
