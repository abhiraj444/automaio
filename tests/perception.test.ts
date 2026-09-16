import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, Browser, Page } from 'playwright';
import { A11yExtractor } from '../src/perception/a11y.js';
import { DOMPruner } from '../src/perception/dom-pruner.js';

describe('Cost Ladder Perception Engine', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
  });

  afterAll(async () => {
    await browser.close();
  });

  it('Level 1: extracts compact accessibility snapshot with low token overhead', async () => {
    await page.setContent(`
      <main>
        <h1>Staff Selection Commission</h1>
        <form>
          <label>Registration Number <input type="text" name="reg" /></label>
          <button type="submit">Download Admit Card</button>
        </form>
      </main>
    `);

    const a11y = await A11yExtractor.capture(page);
    expect(a11y.formattedText).toContain('role: "button"');
    expect(a11y.tokenEstimate).toBeLessThan(200); // Extremely lightweight
  });

  it('Level 2: prunes DOM into numbered interactive element tokens [ID]', async () => {
    await page.setContent(`
      <header>
        <div class="huge-ad-tracking-banner" style="display:none">Ad Content</div>
        <svg><path d="M0 0h24v24H0z"/></svg>
      </header>
      <form>
        <label for="roll">Roll Number</label>
        <input id="roll" type="text" placeholder="e.g. 12345" />
        <button id="btn-submit">Search</button>
      </form>
    `);

    const dom = await DOMPruner.capture(page);
    expect(dom.elements.length).toBe(2); // Only interactive input and button
    expect(dom.representationText).toContain('[1]');
    expect(dom.representationText).toContain('[2]');
    expect(dom.representationText).toContain('placeholder="e.g. 12345"');
    expect(dom.tokenEstimate).toBeLessThan(500);
  });
});
