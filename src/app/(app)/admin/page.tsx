import { redirect } from 'next/navigation';
import { requireSuperadmin } from '@/lib/auth/guards';

export default async function AdminIndex() {
  await requireSuperadmin();
  redirect('/admin/invitaciones');
}
