import { describe, expect, it } from 'vitest';
import {
  listOrganizationsSchema,
  reactivateOrganizationSchema,
  suspendOrganizationSchema,
  updateQuotaSchema,
} from '@/features/organizations/schemas';

const organizationId = '00000000-0000-4000-b000-00000000000a';

describe('updateQuotaSchema', () => {
  it('accepts integers ≥ 0 with daily ≤ monthly (form strings)', () => {
    expect(
      updateQuotaSchema.parse({ organizationId, dailyLimit: '3', monthlyLimit: '50' }),
    ).toEqual({
      organizationId,
      dailyLimit: 3,
      monthlyLimit: 50,
    });
    expect(
      updateQuotaSchema.parse({ organizationId, dailyLimit: '0', monthlyLimit: '0' }).dailyLimit,
    ).toBe(0);
  });
  it('rejects negatives and decimals', () => {
    for (const [dailyLimit, monthlyLimit] of [
      ['-1', '5'],
      ['1.5', '5'],
      ['1', '-2'],
      ['x', '5'],
    ]) {
      expect(
        updateQuotaSchema.safeParse({ organizationId, dailyLimit, monthlyLimit }).success,
      ).toBe(false);
    }
  });
  it('puts daily > monthly on the daily field', () => {
    const result = updateQuotaSchema.safeParse({
      organizationId,
      dailyLimit: '5',
      monthlyLimit: '3',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['dailyLimit']);
  });
  it('rejects a non-uuid organizationId', () => {
    expect(
      updateQuotaSchema.safeParse({ organizationId: 'abc', dailyLimit: '1', monthlyLimit: '2' })
        .success,
    ).toBe(false);
  });
});

describe('suspendOrganizationSchema', () => {
  it('trims the reason and requires 1–500 characters', () => {
    expect(suspendOrganizationSchema.parse({ organizationId, reason: '  Impago  ' }).reason).toBe(
      'Impago',
    );
    expect(suspendOrganizationSchema.safeParse({ organizationId, reason: '     ' }).success).toBe(
      false,
    );
    expect(
      suspendOrganizationSchema.safeParse({ organizationId, reason: 'x'.repeat(501) }).success,
    ).toBe(false);
    expect(
      suspendOrganizationSchema.safeParse({ organizationId, reason: 'x'.repeat(500) }).success,
    ).toBe(true);
  });
  it('rejects a non-uuid organizationId', () => {
    expect(
      suspendOrganizationSchema.safeParse({ organizationId: '1', reason: 'Impago' }).success,
    ).toBe(false);
  });
});

describe('reactivateOrganizationSchema', () => {
  it('requires a uuid organizationId', () => {
    expect(reactivateOrganizationSchema.safeParse({ organizationId }).success).toBe(true);
    expect(reactivateOrganizationSchema.safeParse({ organizationId: 'org-a' }).success).toBe(false);
  });
});

describe('listOrganizationsSchema', () => {
  it('keeps the search and a valid page', () => {
    expect(listOrganizationsSchema.parse({ q: ' Ana ', pagina: '3' })).toEqual({
      q: 'Ana',
      page: 3,
    });
    expect(listOrganizationsSchema.parse({ pagina: 'x' })).toEqual({ page: 1 });
  });
});
