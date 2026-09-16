import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, Browser, Page } from 'playwright';
import { RuntimeEngine } from '../src/core/runtime.js';
import { Recipe } from '../src/types/recipe.js';

describe('Deterministic IR Runtime Interpreter', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
  });

  afterAll(async () => {
    await browser.close();
  });

  it('executes a multi-step IR recipe with variables and extraction deterministically', async () => {
    // Set up a mock local portal page
    await page.setContent(`
      <html>
        <body>
          <h2>SSC Admit Card Portal</h2>
          <form id="admit-form">
            <label for="reg">Registration Number</label>
            <input id="reg" type="text" />

            <label for="dob">Date of Birth</label>
            <input id="dob" type="text" />

            <label for="region">Exam Region</label>
            <select id="region">
              <option value="NR">Northern Region</option>
              <option value="CR">Central Region</option>
            </select>

            <button id="search-btn" type="button" onclick="document.getElementById('result-badge').style.display='block'">Check Status</button>
          </form>

          <div id="result-badge" style="display: none;">
            Roll Number: <span id="roll-no">SSC-CGL-98214</span>
          </div>
        </body>
      </html>
    `);

    const recipe: Recipe = {
      id: 'test_recipe_admit_card',
      taskKey: 'ssc.cgl.admit_card',
      name: 'SSC CGL Admit Card Download',
      siteDomain: 'ssc.gov.in',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sessionTTLSeconds: 900,
      inputSchema: {},
      outputSchema: {},
      steps: [
        {
          id: 'step_1',
          op: {
            op: 'fill',
            target: { id: 'reg', role: 'textbox' },
            value: '$user.registration_no'
          }
        },
        {
          id: 'step_2',
          op: {
            op: 'fill',
            target: { id: 'dob', role: 'textbox' },
            value: '$user.dob'
          }
        },
        {
          id: 'step_3',
          op: {
            op: 'select',
            target: { id: 'region', role: 'combobox' },
            option: 'Northern Region'
          }
        },
        {
          id: 'step_4',
          op: {
            op: 'click',
            target: { id: 'search-btn', role: 'button', name: 'Check Status' }
          }
        },
        {
          id: 'step_5',
          op: {
            op: 'wait_for',
            condition: { selector: '#result-badge', state: 'visible' }
          }
        },
        {
          id: 'step_6',
          op: {
            op: 'extract',
            target: { selector: '#roll-no' },
            saveAs: 'assigned_roll_no'
          }
        },
        {
          id: 'step_7',
          op: {
            op: 'assert',
            condition: 'Roll Number exists',
            target: { selector: '#roll-no' },
            expected: 'SSC-CGL'
          }
        }
      ],
      subRecipes: [],
      successCount: 0,
      failCount: 0,
      canaryStatus: 'healthy'
    };

    const userData = {
      registration_no: 'REG20269988',
      dob: '15/03/1998'
    };

    const runtime = new RuntimeEngine(page, recipe, {}, userData);
    const result = await runtime.execute();

    expect(result.success).toBe(true);
    expect(result.stepsCompleted).toBe(7);

    // Verify values were actually populated into the DOM
    const regValue = await page.locator('#reg').inputValue();
    expect(regValue).toBe('REG20269988');

    // Verify extraction state
    const extractedRoll = runtime.getStateMachine().getContext().extractedData['assigned_roll_no'];
    expect(extractedRoll).toBe('SSC-CGL-98214');
  });

  it('stops in probe mode when encountering a destructive action (Final Submit)', async () => {
    await page.setContent(`
      <form>
        <button id="final-btn">Final Submit Application</button>
      </form>
    `);

    const destructiveRecipe: Recipe = {
      id: 'destructive_test',
      taskKey: 'test.destructive',
      name: 'Destructive Test',
      siteDomain: 'example.com',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sessionTTLSeconds: 900,
      steps: [
        {
          id: 'step_submit',
          op: {
            op: 'click',
            target: { id: 'final-btn', text: 'Final Submit Application' }
          },
          destructive: true
        }
      ],
      subRecipes: [],
      successCount: 0,
      failCount: 0,
      canaryStatus: 'healthy'
    };

    // Run in probeMode: true
    const runtime = new RuntimeEngine(page, destructiveRecipe, { probeMode: true });
    const result = await runtime.execute();

    // Should succeed safely by hard-stopping before clicking final submit
    expect(result.success).toBe(true);
    expect(result.stepsCompleted).toBe(0);
  });
});
