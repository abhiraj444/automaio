import { Page } from 'playwright';
import { createHash } from 'crypto';

export interface PageFingerprint {
  hash: string;
  fieldCount: number;
  formCount: number;
  inputLabels: string[];
  structuralSummary: string;
}

export class PageFingerprinter {
  /**
   * Captures the structural fingerprint of a page without volatile content
   */
  static async capture(page: Page): Promise<PageFingerprint> {
    const rawStructure = await page.evaluate(() => {
      // Collect all form controls and their semantic labels
      const controls = Array.from(
        document.querySelectorAll('input:not([type="hidden"]), select, textarea, button, a[role="button"]')
      );

      const labels = controls.map(el => {
        const id = el.id;
        let labelText = '';
        if (id) {
          const labelEl = document.querySelector(`label[for="${id}"]`);
          if (labelEl) labelText = labelEl.textContent?.trim() || '';
        }
        if (!labelText) {
          const parentLabel = el.closest('label');
          if (parentLabel) labelText = parentLabel.textContent?.trim() || '';
        }
        const ariaLabel = el.getAttribute('aria-label') || '';
        const name = el.getAttribute('name') || '';
        const placeholder = el.getAttribute('placeholder') || '';
        const role = el.getAttribute('role') || el.tagName.toLowerCase();
        
        return `${role}:${labelText || ariaLabel || name || placeholder}`.toLowerCase().replace(/\s+/g, ' ');
      }).filter(Boolean);

      // Structure of main forms
      const forms = Array.from(document.querySelectorAll('form')).map(f => {
        const fieldNames = Array.from(f.querySelectorAll('input, select, textarea'))
          .map(i => i.getAttribute('name') || i.id || '')
          .filter(Boolean)
          .sort()
          .join(',');
        return `form[${fieldNames}]`;
      });

      return {
        formCount: forms.length,
        fieldCount: controls.length,
        inputLabels: Array.from(new Set(labels)).sort(),
        structuralSummary: forms.join('|')
      };
    });

    const contentToHash = `${rawStructure.formCount}|${rawStructure.fieldCount}|${rawStructure.structuralSummary}|${rawStructure.inputLabels.join(';')}`;
    const hash = createHash('sha256').update(contentToHash).digest('hex').substring(0, 16);

    return {
      hash,
      fieldCount: rawStructure.fieldCount,
      formCount: rawStructure.formCount,
      inputLabels: rawStructure.inputLabels,
      structuralSummary: rawStructure.structuralSummary
    };
  }

  /**
   * Evaluates drift between an expected fingerprint hash or structure and the live page
   */
  static isMatch(expectedHash: string | undefined, current: PageFingerprint): boolean {
    if (!expectedHash) return true;
    return expectedHash === current.hash;
  }
}
