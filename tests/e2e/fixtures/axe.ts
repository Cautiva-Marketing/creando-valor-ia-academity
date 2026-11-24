import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** Fails on `serious` or `critical` WCAG 2.2 A/AA violations (SC-009). */
export async function expectNoA11yViolations(
  page: Page,
  {
    include,
    exclude = [],
    disableRules = [],
  }: { include?: string; exclude?: string[]; disableRules?: string[] } = {},
): Promise<void> {
  let builder = new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .disableRules(disableRules);
  if (include) builder = builder.include(include);
  for (const selector of exclude) builder = builder.exclude(selector);
  const results = await builder.analyze();
  const blocking = results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map(
      (v) =>
        `${v.id} (${v.impact}): ${v.help} → ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
    );
  expect(blocking, 'axe serious/critical violations').toEqual([]);
}
