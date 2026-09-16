import { Page } from 'playwright';
import { A11yNode } from '../types/perception.js';

export class A11yExtractor {
  /**
   * Captures a clean, compacted accessibility tree representation via CDP
   */
  static async capture(page: Page): Promise<{ tree: A11yNode | null; formattedText: string; tokenEstimate: number }> {
    try {
      const cdp = await page.context().newCDPSession(page);
      const { nodes } = await cdp.send('Accessibility.getFullAXTree');
      await cdp.detach().catch(() => {});

      if (!nodes || nodes.length === 0) {
        return { tree: null, formattedText: 'Empty accessibility tree', tokenEstimate: 3 };
      }

      const lines: string[] = [];
      for (const node of nodes) {
        const role = node.role?.value || '';
        const name = node.name?.value || '';
        const value = node.value?.value || '';
        const description = node.description?.value || '';

        // Only include non-generic nodes with content or interactive roles
        const interestingRoles = ['button', 'textbox', 'link', 'combobox', 'checkbox', 'radio', 'heading', 'form'];
        if (interestingRoles.includes(role) || name) {
          const parts: string[] = [`- role: "${role}"`];
          if (name) parts.push(`name: "${name}"`);
          if (value) parts.push(`value: "${value}"`);
          if (description) parts.push(`description: "${description}"`);
          lines.push(parts.join(' | '));
        }
      }

      const formattedText = lines.length > 0 ? lines.join('\n') : 'No interactive accessibility nodes found';
      const tokenEstimate = Math.ceil(formattedText.length / 4);

      return {
        tree: { role: 'RootWebArea', children: [] },
        formattedText,
        tokenEstimate
      };
    } catch (err: any) {
      // Fallback: evaluate basic ARIA and semantic nodes in DOM
      const fallbackNodes = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('button, input, select, textarea, a[href], h1, h2, h3, [role]'));
        return els.map(el => {
          const role = el.getAttribute('role') || el.tagName.toLowerCase();
          const name = el.getAttribute('aria-label') || el.textContent?.trim().substring(0, 40) || '';
          return `- role: "${role}" | name: "${name}"`;
        });
      });

      const formattedText = fallbackNodes.join('\n');
      return {
        tree: null,
        formattedText,
        tokenEstimate: Math.ceil(formattedText.length / 4)
      };
    }
  }
}
