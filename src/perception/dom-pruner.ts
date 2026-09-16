import { Page } from 'playwright';
import { PrunedDOMSnapshot, PrunedElement } from '../types/perception.js';

export class DOMPruner {
  /**
   * Scans page and extracts interactive elements with assigned numeric tokens [1], [2], etc.
   * Keeps token count under ~2000 tokens by discarding non-interactive clutter.
   */
  static async capture(page: Page): Promise<PrunedDOMSnapshot> {
    const rawElements = await page.evaluate(() => {
      const interactiveSelectors = [
        'a[href]',
        'button',
        'input',
        'select',
        'textarea',
        '[role="button"]',
        '[role="link"]',
        '[role="checkbox"]',
        '[role="radio"]',
        '[role="combobox"]',
        '[tabindex]:not([tabindex="-1"])'
      ];

      const nodes = Array.from(document.querySelectorAll(interactiveSelectors.join(',')));
      
      return nodes.map((node, index) => {
        const el = node as HTMLElement;
        const rect = el.getBoundingClientRect();
        
        // Filter out invisible elements
        if (rect.width === 0 || rect.height === 0 || window.getComputedStyle(el).display === 'none' || window.getComputedStyle(el).visibility === 'hidden') {
          return null;
        }

        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute('role') || tag;
        const type = el.getAttribute('type') || undefined;
        const name = el.getAttribute('name') || undefined;
        const placeholder = el.getAttribute('placeholder') || undefined;
        const ariaLabel = el.getAttribute('aria-label') || undefined;
        
        let labelText = '';
        if (el.id) {
          const l = document.querySelector(`label[for="${el.id}"]`);
          if (l) labelText = l.textContent?.trim() || '';
        }
        if (!labelText && el.closest('label')) {
          labelText = el.closest('label')?.textContent?.trim() || '';
        }

        const directText = el.textContent?.trim().replace(/\s+/g, ' ').substring(0, 80) || '';
        const effectiveText = labelText || ariaLabel || directText || placeholder || '';

        // Build a unique CSS selector for this element
        let selector = '';
        if (el.id) {
          selector = `#${el.id}`;
        } else if (name) {
          selector = `${tag}[name="${name}"]`;
        } else {
          selector = `${tag}:has-text("${effectiveText.substring(0, 30)}")`;
        }

        return {
          id: index + 1,
          tag,
          role,
          type,
          name,
          placeholder,
          ariaLabel,
          text: effectiveText,
          selector,
          boundingBox: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          }
        };
      }).filter(Boolean);
    });

    const elements: PrunedElement[] = (rawElements as any[]).filter(Boolean);
    const title = await page.title();
    const url = page.url();

    const lines: string[] = [
      `Page: ${title} (${url})`,
      'Interactive Elements:'
    ];

    for (const el of elements) {
      const details = [
        `[${el.id}]`,
        `<${el.tag}>`,
        el.role ? `role="${el.role}"` : '',
        el.type ? `type="${el.type}"` : '',
        el.name ? `name="${el.name}"` : '',
        el.text ? `text="${el.text}"` : '',
        el.placeholder ? `placeholder="${el.placeholder}"` : ''
      ].filter(Boolean).join(' ');

      lines.push(`  ${details}`);
    }

    const representationText = lines.join('\n');
    const tokenEstimate = Math.ceil(representationText.length / 4);

    return {
      url,
      title,
      elements,
      representationText,
      tokenEstimate
    };
  }
}
