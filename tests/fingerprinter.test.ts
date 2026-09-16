import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, Browser, Page } from 'playwright';
import { PageFingerprinter } from '../src/core/fingerprinter.js';

describe('Page Fingerprinter', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
  });

  afterAll(async () => {
    await browser.close();
  });

  it('produces identical fingerprints for structural matches despite volatile dynamic text', async () => {
    await page.setContent(`
      <form id="f1">
        <label>Name <input name="full_name" /></label>
        <label>DOB <input name="dob" /></label>
        <button type="submit">Submit</button>
      </form>
      <div id="dynamic-time">Time: 10:45:00 AM</div>
    `);

    const fp1 = await PageFingerprinter.capture(page);

    // Change dynamic text, but keep structure identical
    await page.setContent(`
      <form id="f1">
        <label>Name <input name="full_name" /></label>
        <label>DOB <input name="dob" /></label>
        <button type="submit">Submit</button>
      </form>
      <div id="dynamic-time">Time: 10:59:22 PM (Server Load: 88%)</div>
    `);

    const fp2 = await PageFingerprinter.capture(page);
    expect(fp1.hash).toBe(fp2.hash);
    expect(PageFingerprinter.isMatch(fp1.hash, fp2)).toBe(true);
  });

  it('detects structural drift when form inputs or controls change', async () => {
    await page.setContent(`
      <form id="f1">
        <label>Name <input name="full_name" /></label>
        <button type="submit">Submit</button>
      </form>
    `);
    const originalFp = await PageFingerprinter.capture(page);

    // Portal added a new mandatory CAPTCHA or Aadhaar input
    await page.setContent(`
      <form id="f1">
        <label>Name <input name="full_name" /></label>
        <label>Aadhaar Number <input name="aadhaar" /></label>
        <button type="submit">Submit</button>
      </form>
    `);
    const driftedFp = await PageFingerprinter.capture(page);

    expect(originalFp.hash).not.toBe(driftedFp.hash);
    expect(PageFingerprinter.isMatch(originalFp.hash, driftedFp)).toBe(false);
  });
});
