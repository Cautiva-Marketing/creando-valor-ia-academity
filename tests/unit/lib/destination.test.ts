import { describe, expect, it } from 'vitest';
import type { ContextMembership, RequestContext } from '@/lib/auth/context-types';
import { destinationFor } from '@/lib/auth/destination';

const activeMembership: ContextMembership = {
  organization_id: 'org',
  type: 'personal',
  status: 'active',
  roles: ['vendedor'],
  org_status: 'active',
};

function ctx(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    user_id: 'u',
    email: 'a@b.test',
    full_name: 'A',
    timezone: 'America/Lima',
    session_ok: true,
    aal: 'aal1',
    is_superadmin_account: false,
    has_verified_factor: false,
    onboarding_status: 'completed',
    onboarding_step: 3,
    memberships: [activeMembership],
    ...overrides,
  };
}

describe('destinationFor (contracts/routes.md)', () => {
  it('superadmin without factor → /mfa/registrar', () => {
    expect(destinationFor(ctx({ is_superadmin_account: true, memberships: [] }))).toBe(
      '/mfa/registrar',
    );
  });
  it('superadmin with factor and aal1 → /mfa/verificar keeping next', () => {
    expect(
      destinationFor(
        ctx({ is_superadmin_account: true, has_verified_factor: true, memberships: [] }),
        '/design',
      ),
    ).toBe('/mfa/verificar?next=%2Fdesign');
  });
  it('superadmin aal2 → next or /admin/invitaciones', () => {
    const sa = ctx({
      is_superadmin_account: true,
      has_verified_factor: true,
      aal: 'aal2',
      memberships: [],
    });
    expect(destinationFor(sa)).toBe('/admin/invitaciones');
    expect(destinationFor(sa, '/admin/consumo')).toBe('/admin/consumo');
  });
  it('seller without operative membership → /acceso-suspendido', () => {
    expect(
      destinationFor(ctx({ memberships: [{ ...activeMembership, org_status: 'suspended' }] })),
    ).toBe('/acceso-suspendido');
    expect(
      destinationFor(ctx({ memberships: [{ ...activeMembership, status: 'suspended' }] })),
    ).toBe('/acceso-suspendido');
  });
  it('seller with pending or in-progress onboarding → /onboarding', () => {
    expect(destinationFor(ctx({ onboarding_status: 'pending' }))).toBe('/onboarding');
    expect(destinationFor(ctx({ onboarding_status: 'in_progress' }), '/perfil')).toBe(
      '/onboarding',
    );
  });
  it('seller → next or /inicio; external next ignored', () => {
    expect(destinationFor(ctx())).toBe('/inicio');
    expect(destinationFor(ctx({ onboarding_status: 'skipped' }), '/perfil')).toBe('/perfil');
    expect(destinationFor(ctx(), 'https://evil.example')).toBe('/inicio');
  });
});
