/**
 * Documented seed data (supabase/seed.sql). READ-ONLY for e2e tests: any test that mutates state
 * creates its own data with factories.ts (tasks.md → "Regla de datos e2e").
 */
export const SEED_PASSWORD = 'Semilla-Segura-2026';
export const SEED_TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

export const SEED_USERS = {
  superadmin: {
    id: '00000000-0000-4000-a000-000000000001',
    email: 'superadmin@ejemplo.test',
    factorId: '00000000-0000-4000-d000-000000000001',
    fullName: 'Sofía Superadmin',
  },
  superadminSinFactor: {
    id: '00000000-0000-4000-a000-000000000002',
    email: 'superadmin.sinfactor@ejemplo.test',
    fullName: 'Samuel Sin Factor',
  },
  vendedorA: {
    id: '00000000-0000-4000-a000-000000000011',
    email: 'vendedor.a@ejemplo.test',
    fullName: 'Ana Vendedora',
    orgId: '00000000-0000-4000-b000-00000000000a',
  },
  vendedorB: {
    id: '00000000-0000-4000-a000-000000000012',
    email: 'vendedor.b@ejemplo.test',
    fullName: 'Bruno Vendedor',
    orgId: '00000000-0000-4000-b000-00000000000b',
  },
  vendedorC: {
    id: '00000000-0000-4000-a000-000000000013',
    email: 'vendedor.c@ejemplo.test',
    fullName: 'Carla Vendedora',
    orgId: '00000000-0000-4000-b000-00000000000c',
  },
  vendedorD: {
    id: '00000000-0000-4000-a000-000000000014',
    email: 'vendedor.d@ejemplo.test',
    fullName: 'Diego Vendedor',
    orgId: '00000000-0000-4000-b000-00000000000d',
  },
  vendedorE: {
    id: '00000000-0000-4000-a000-000000000015',
    email: 'vendedor.e@ejemplo.test',
    fullName: 'Elena Vendedora',
    orgId: '00000000-0000-4000-b000-00000000000e',
  },
} as const;

export const SEED_INVITATIONS = {
  pending: {
    id: '00000000-0000-4000-e000-000000000001',
    email: 'invitacion.pendiente@ejemplo.test',
    token: 'seed-pending-token-aaaaaaaaaaaaaaaaaaaaaaaa',
  },
  accepted: {
    id: '00000000-0000-4000-e000-000000000002',
    email: 'vendedor.a@ejemplo.test',
    token: 'seed-accepted-token-aaaaaaaaaaaaaaaaaaaaaaa',
  },
  expired: {
    id: '00000000-0000-4000-e000-000000000003',
    email: 'invitacion.vencida@ejemplo.test',
    token: 'seed-expired-token-aaaaaaaaaaaaaaaaaaaaaaaa',
  },
  revoked: {
    id: '00000000-0000-4000-e000-000000000004',
    email: 'invitacion.revocada@ejemplo.test',
    token: 'seed-revoked-token-aaaaaaaaaaaaaaaaaaaaaaaa',
  },
} as const;

export const SEED_ACCESS_REQUESTS = {
  new: { id: '00000000-0000-4000-f000-000000000001', email: 'solicitud.nueva@ejemplo.test' },
  invited: {
    id: '00000000-0000-4000-f000-000000000002',
    email: 'invitacion.pendiente@ejemplo.test',
  },
  discarded: {
    id: '00000000-0000-4000-f000-000000000003',
    email: 'solicitud.descartada@ejemplo.test',
  },
} as const;

export const SEED_LEGAL_DOCUMENTS = {
  terms: '00000000-0000-4000-c000-000000000001',
  ai_notice: '00000000-0000-4000-c000-000000000002',
  privacy: '00000000-0000-4000-c000-000000000003',
} as const;
