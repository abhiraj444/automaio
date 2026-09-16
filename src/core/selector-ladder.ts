import { Page, Locator } from 'playwright';
import { SemanticTarget } from '../types/ir.js';

export interface SelectorResolutionResult {
  locator: Locator;
  tier: 'a11y' | 'stable-attr' | 'text-anchor' | 'positional-selector' | 'xpath' | 'element-id';
  healed: boolean;
  selectorUsed: string;
}

/**
 * 5-Tier Semantic Selector Fallback Ladder
 * Resolves elements using intent-first principles and graceful degradation.
 */
export class SelectorLadder {
  constructor(private page: Page) {}

  async resolve(target: SemanticTarget, timeoutMs: number = 4000): Promise<SelectorResolutionResult> {
    const attemptedTiers: string[] = [];

    // Tier 1: Accessibility (Role + Accessible Name or Text)
    // Only resolve via A11y role if a specific name or text is given,
    // OR if no stable attributes (id, nameAttr, testId) are specified.
    const hasSpecificA11y = (target.role && target.name) || target.name || target.text;
    const hasStableAttributes = Boolean(target.id || target.nameAttr || target.testId);

    if (hasSpecificA11y || (target.role && !hasStableAttributes)) {
      try {
        let loc: Locator;
        if (target.role && target.name) {
          loc = this.page.getByRole(target.role as any, { name: target.name, exact: false });
        } else if (target.name) {
          loc = this.page.getByLabel(target.name, { exact: false });
        } else if (target.text) {
          loc = this.page.getByText(target.text, { exact: false });
        } else {
          loc = this.page.getByRole(target.role as any);
        }

        const count = await loc.count();
        if (count > 0 && await loc.first().isVisible({ timeout: 1000 }).catch(() => false)) {
          return {
            locator: loc.first(),
            tier: 'a11y',
            healed: false,
            selectorUsed: `role=${target.role || ''}, name=${target.name || target.text || ''}`
          };
        }
        attemptedTiers.push('a11y');
      } catch (err) {
        attemptedTiers.push('a11y(failed)');
      }
    }

    // Tier 2: Stable Attributes (id, name, testId, placeholder)
    const stableQueries: Array<{ type: string; selector: string }> = [];
    if (target.testId) stableQueries.push({ type: 'testId', selector: `[data-testid="${target.testId}"]` });
    if (target.id) stableQueries.push({ type: 'id', selector: `#${target.id}` });
    if (target.nameAttr) stableQueries.push({ type: 'nameAttr', selector: `[name="${target.nameAttr}"]` });
    if (target.placeholder) stableQueries.push({ type: 'placeholder', selector: `[placeholder="${target.placeholder}"]` });

    for (const q of stableQueries) {
      try {
        const loc = this.page.locator(q.selector);
        if (await loc.first().isVisible({ timeout: 800 }).catch(() => false)) {
          return {
            locator: loc.first(),
            tier: 'stable-attr',
            healed: attemptedTiers.length > 0,
            selectorUsed: q.selector
          };
        }
      } catch {
        // continue
      }
    }
    if (stableQueries.length > 0) attemptedTiers.push('stable-attr');

    // Tier 3: Nearby Text Anchor (label text pointing to input / button)
    if (target.nearText || target.name || target.text) {
      const anchorText = target.nearText || target.name || target.text!;
      try {
        const anchorCandidates = [
          `label:has-text("${anchorText}") input`,
          `label:has-text("${anchorText}") select`,
          `label:has-text("${anchorText}") textarea`,
          `:has-text("${anchorText}") + input`,
          `:has-text("${anchorText}") + select`,
          `:has-text("${anchorText}") >> input`
        ];

        for (const query of anchorCandidates) {
          const loc = this.page.locator(query);
          if (await loc.first().isVisible({ timeout: 600 }).catch(() => false)) {
            return {
              locator: loc.first(),
              tier: 'text-anchor',
              healed: attemptedTiers.length > 0,
              selectorUsed: query
            };
          }
        }
        attemptedTiers.push('text-anchor');
      } catch {
        attemptedTiers.push('text-anchor(failed)');
      }
    }

    // Tier 4: Positional / Structural Selector
    if (target.selector) {
      try {
        const loc = this.page.locator(target.selector);
        if (await loc.first().isVisible({ timeout: 1000 }).catch(() => false)) {
          return {
            locator: loc.first(),
            tier: 'positional-selector',
            healed: attemptedTiers.length > 0,
            selectorUsed: target.selector
          };
        }
        attemptedTiers.push('positional-selector');
      } catch {
        attemptedTiers.push('positional-selector(failed)');
      }
    }

    // Tier 5: XPath (Last Resort)
    if (target.xpath) {
      try {
        const loc = this.page.locator(`xpath=${target.xpath}`);
        if (await loc.first().isVisible({ timeout: 1000 }).catch(() => false)) {
          return {
            locator: loc.first(),
            tier: 'xpath',
            healed: true,
            selectorUsed: target.xpath
          };
        }
        attemptedTiers.push('xpath');
      } catch {
        attemptedTiers.push('xpath(failed)');
      }
    }

    throw new Error(
      `SelectorLadder failed to resolve element for target: ${JSON.stringify(target)}. Attempted tiers: [${attemptedTiers.join(', ')}]`
    );
  }
}
