import { Page } from 'playwright';
import { PrunedElement } from '../types/perception.js';

export class SetOfMarkAnnotator {
  /**
   * Injects numbered bounding badges over interactive elements and captures a screenshot
   */
  static async captureAnnotatedScreenshot(page: Page, elements: PrunedElement[]): Promise<Buffer> {
    // 1. Inject overlay badges into DOM
    await page.evaluate((items) => {
      const containerId = '__automaio_som_container__';
      let container = document.getElementById(containerId);
      if (container) container.remove();

      container = document.createElement('div');
      container.id = containerId;
      container.style.position = 'absolute';
      container.style.top = '0';
      container.style.left = '0';
      container.style.width = '100%';
      container.style.height = '100%';
      container.style.pointerEvents = 'none';
      container.style.zIndex = '2147483647';

      for (const item of items) {
        if (!item.boundingBox) continue;
        const box = item.boundingBox;

        // Bounding outline
        const outline = document.createElement('div');
        outline.style.position = 'absolute';
        outline.style.left = `${box.x}px`;
        outline.style.top = `${box.y}px`;
        outline.style.width = `${box.width}px`;
        outline.style.height = `${box.height}px`;
        outline.style.border = '2px solid #ff0055';
        outline.style.borderRadius = '3px';
        outline.style.boxSizing = 'border-box';

        // Badge label
        const badge = document.createElement('span');
        badge.textContent = `[${item.id}]`;
        badge.style.position = 'absolute';
        badge.style.left = `${box.x}px`;
        badge.style.top = `${Math.max(0, box.y - 18)}px`;
        badge.style.backgroundColor = '#ff0055';
        badge.style.color = '#ffffff';
        badge.style.fontSize = '12px';
        badge.style.fontWeight = 'bold';
        badge.style.padding = '1px 4px';
        badge.style.borderRadius = '2px';
        badge.style.fontFamily = 'monospace';

        container.appendChild(outline);
        container.appendChild(badge);
      }

      document.body.appendChild(container);
    }, elements);

    // 2. Take screenshot
    const screenshot = await page.screenshot({ type: 'jpeg', quality: 75, fullPage: false });

    // 3. Remove overlay from page
    await page.evaluate(() => {
      const container = document.getElementById('__automaio_som_container__');
      if (container) container.remove();
    });

    return screenshot;
  }
}
