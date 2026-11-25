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

/** 002 practice seed (supabase/seed.sql → "002 · Seller practice"), same shape for sellers A and B. */
function practiceSeed(l: 'a' | 'b') {
  const id = (group: string, suffix: string) =>
    `00000000-0000-4000-${group}-000000000${l}${suffix}`;
  return {
    products: {
      realEstate: {
        id: id('9100', '01'),
        name: 'Lote en Lurín – Etapa 1',
        versionIds: [id('9200', '11'), id('9200', '12')],
      },
      hardware: {
        id: id('9100', '02'),
        name: 'Kit de herramientas Pro',
        versionIds: [id('9200', '21')],
      },
      archived: {
        id: id('9100', '03'),
        name: 'Cuenta de ahorro Cooperativa',
        versionIds: [id('9200', '31')],
      },
    },
    objections: {
      distance: id('9300', '11'),
      price: id('9300', '12'),
      trust: id('9300', '13'),
      competition: id('9300', '21'),
      decisionMaker: id('9300', '22'),
    },
    sessions: {
      /** Evaluated yesterday: 72 (developing), undue_pressure flag, one no_evaluable criterion. */
      evaluated: id('9000', '01'),
      /** Finalized, evaluation failed, 2 of 3 manual retries used. */
      failed: id('9000', '02'),
      /** Finalized by time with no seller messages: not_applicable. */
      notApplicable: id('9000', '03'),
      /** Evaluated 6 days ago: 54 (reinforcement), unfounded_promise flag. */
      evaluatedOlder: id('9000', '04'),
    },
    evaluations: { evaluated: id('9400', '01'), evaluatedOlder: id('9400', '04') },
  } as const;
}

export const SEED_PRACTICE = {
  rubricId: '00000000-0000-4000-8000-0000000000a1',
  vendedorA: practiceSeed('a'),
  vendedorB: practiceSeed('b'),
} as const;
