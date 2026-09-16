import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, Browser, Page } from 'playwright';
import http from 'http';
import { RuntimeEngine } from '../src/core/runtime.js';
import { Recipe } from '../src/types/recipe.js';
import { FormProber } from '../src/miniapp/prober.js';
import { MiniAppSchemaBuilder } from '../src/miniapp/schema-builder.js';
import { EncryptedUserVault } from '../src/store/vault.js';
import { RepairAgent } from '../src/ai/repair.js';
import { SmartLLMRouter } from '../src/ai/provider.js';

describe('End-to-End Mock Exam Portal Flow', () => {
  let server: http.Server;
  let serverUrl: string;
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    // 1. Start a local HTTP server simulating a government portal
    server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
          <head><title>Mock Govt Examination Board</title></head>
          <body>
            <h2>Admit Card Portal 2026</h2>
            <form id="portal-form">
              <div>
                <label for="txt-reg">Registration ID</label>
                <input id="txt-reg" name="reg_id" type="text" required maxlength="12" />
              </div>
              <div>
                <label for="txt-dob">Date of Birth (DD/MM/YYYY)</label>
                <input id="txt-dob" name="dob" type="text" required />
              </div>
              <div>
                <label for="sel-stream">Graduation Degree</label>
                <select id="sel-stream" name="degree">
                  <option value="">Select Degree</option>
                  <option value="btech">B.E./B.Tech</option>
                  <option value="bsc">B.Sc Computer Science</option>
                </select>
              </div>
              <div id="captcha-box" style="margin: 10px 0; border: 1px dashed red; padding: 10px;">
                <label for="captcha-input">Enter CAPTCHA: <strong id="captcha-code">A8K9</strong></label>
                <input id="captcha-input" name="captcha" type="text" />
              </div>
              <button id="btn-fetch" type="button" onclick="validate()">Download Hall Ticket</button>
            </form>
            <div id="admit-card-result" style="display: none;">
              <h3>HALL TICKET ISSUED</h3>
              <p>Candidate: <span id="candidate-name">Rahul Kumar Sharma</span></p>
              <p>Roll No: <span id="candidate-roll">SSC-2026-99120</span></p>
            </div>
            <script>
              function validate() {
                var c = document.getElementById('captcha-input').value;
                if (c === 'A8K9') {
                  document.getElementById('admit-card-result').style.display = 'block';
                } else {
                  alert('Invalid CAPTCHA');
                }
              }
            </script>
          </body>
        </html>
      `);
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address() as any;
        serverUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });

    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
  });

  afterAll(async () => {
    await browser.close();
    server.close();
  });

  it('1. Pass 1 Probe: scans portal constraints and builds pre-filled mini-app schema', async () => {
    await page.goto(serverUrl);

    const probed = await FormProber.probeForm(page);
    expect(probed.fields.length).toBe(4);

    const vault = new EncryptedUserVault();
    const mockVaultData = {
      name: 'Rahul Kumar Sharma',
      dob: '15/03/1998',
      aadhar_number: '1234-5678-9012'
    };

    const miniApp = MiniAppSchemaBuilder.build(probed, mockVaultData);
    expect(miniApp.fields.find(f => f.name === 'dob')?.autoFilledValue).toBe('15/03/1998');
    expect(miniApp.fields.find(f => f.name === 'reg_id')?.maxLength).toBe(12);
  });

  it('2. Pass 2 Execution: runs recipe with live CAPTCHA handoff resolution', async () => {
    await page.goto(serverUrl);

    const recipe: Recipe = {
      id: 'e2e_admit_card_recipe',
      taskKey: 'mock.admit_card.download',
      name: 'Download Mock Admit Card',
      siteDomain: '127.0.0.1',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sessionTTLSeconds: 900,
      steps: [
        {
          id: 'step_reg',
          op: {
            op: 'fill',
            target: { id: 'txt-reg', role: 'textbox', name: 'Registration ID' },
            value: '$user.reg_id'
          }
        },
        {
          id: 'step_dob',
          op: {
            op: 'fill',
            target: { id: 'txt-dob', role: 'textbox', name: 'Date of Birth' },
            value: '$user.dob'
          }
        },
        {
          id: 'step_degree',
          op: {
            op: 'select',
            target: { id: 'sel-stream', role: 'combobox' },
            option: 'B.E./B.Tech'
          }
        },
        {
          id: 'step_captcha_handoff',
          op: {
            op: 'handoff',
            reason: 'captcha',
            hint: 'Please solve the CAPTCHA A8K9'
          }
        },
        {
          id: 'step_submit',
          op: {
            op: 'click',
            target: { id: 'btn-fetch', role: 'button', name: 'Download Hall Ticket' }
          }
        },
        {
          id: 'step_extract_roll',
          op: {
            op: 'extract',
            target: { selector: '#candidate-roll' },
            saveAs: 'roll_number'
          }
        }
      ],
      subRecipes: [],
      successCount: 0,
      failCount: 0,
      canaryStatus: 'healthy'
    };

    let handoffFired = false;

    const runtime = new RuntimeEngine(
      page,
      recipe,
      {
        onHandoffRequired: async (step, resume) => {
          handoffFired = true;
          expect(step.op.op).toBe('handoff');
          // Simulating the user solving CAPTCHA via the CDP live handoff screen
          await page.fill('#captcha-input', 'A8K9');
          resume();
        }
      },
      {
        reg_id: 'REG20261199',
        dob: '15/03/1998'
      }
    );

    const result = await runtime.execute();
    expect(result.success).toBe(true);
    expect(handoffFired).toBe(true);
    expect(runtime.getStateMachine().getContext().extractedData['roll_number']).toBe('SSC-2026-99120');
  });

  it('3. Repair Mode: recovers from broken selector with targeted LLM repair', async () => {
    // Deliberately broken selector: looking for non-existent #broken-id
    const brokenStep = {
      id: 'step_broken_reg',
      op: {
        op: 'fill' as const,
        target: { id: 'non-existent-broken-selector-id' },
        value: 'REG123'
      }
    };

    const mockRouter = new SmartLLMRouter(async (msgs) => {
      // LLM inspects DOM and patches the selector to the real #txt-reg
      return {
        content: JSON.stringify({
          patchedStep: {
            id: 'step_broken_reg',
            op: {
              op: 'fill',
              target: { id: 'txt-reg', role: 'textbox' },
              value: 'REG123'
            }
          }
        })
      };
    });

    const repairAgent = new RepairAgent(page, mockRouter);
    const patchedStep = await repairAgent.repairStep(brokenStep, new Error('Element not found'));

    expect(patchedStep).not.toBeNull();
    expect((patchedStep?.op as any).target.id).toBe('txt-reg');
  });
});
