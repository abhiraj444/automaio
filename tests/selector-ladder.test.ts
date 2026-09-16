import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, Browser, Page } from 'playwright';
import { SelectorLadder } from '../src/core/selector-ladder.js';

describe('Semantic Selector Fallback Ladder', () => {
  let browser: Browser;
  let page: Page;
  let ladder: SelectorLadder;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
    ladder = new SelectorLadder(page);
  });

  afterAll(async () => {
    await browser.close();
  });

  it('resolves Tier 1: Accessibility role + name', async () => {
    await page.setContent(`
      <button aria-label="Submit Application">Submit</button>
    `);

    const result = await ladder.resolve({ role: 'button', name: 'Submit Application' });
    expect(result.tier).toBe('a11y');
    expect(result.healed).toBe(false);
  });

  it('resolves Tier 2: Stable attributes when a11y fails', async () => {
    await page.setContent(`
      <input id="applicant-reg-no" placeholder="Enter Registration" />
    `);

    // Intent was looking for role: 'textbox' name: 'NonExistent', but provided id
    const result = await ladder.resolve({
      role: 'textbox',
      name: 'NonExistent',
      id: 'applicant-reg-no'
    });

    expect(result.tier).toBe('stable-attr');
    expect(result.healed).toBe(true);
  });

  it('resolves Tier 3: Nearby Text Anchor when attributes drift', async () => {
    // Government portals often change IDs (e.g. from id="roll_no" to id="txt_4812_x")
    // but the visible label "Roll Number" remains next to the input
    await page.setContent(`
      <label>Roll Number <input class="random-obfuscated-class" /></label>
    `);

    const result = await ladder.resolve({
      id: 'obsolete-id-1234',
      nearText: 'Roll Number'
    });

    expect(result.tier).toBe('text-anchor');
    expect(result.healed).toBe(true);
  });
});
