import { Page } from 'playwright';
import { Recipe, RecipeStep } from '../types/recipe.js';
import { IROp } from '../types/ir.js';
import { SelectorLadder } from './selector-ladder.js';
import { PageFingerprinter } from './fingerprinter.js';
import { SafetyDetector } from './safety.js';
import { StateMachine } from './state-machine.js';

export interface RuntimeOptions {
  probeMode?: boolean; // In probe mode, stops at first destructive step
  enableFingerprintChecks?: boolean;
  onHandoffRequired?: (step: RecipeStep, resume: () => void) => Promise<void>;
  onRepairRequired?: (step: RecipeStep, error: Error) => Promise<RecipeStep | null>;
}

export class RuntimeEngine {
  private selectorLadder: SelectorLadder;
  private stateMachine: StateMachine;

  constructor(
    private page: Page,
    private recipe: Recipe,
    private options: RuntimeOptions = {},
    initialUserData: Record<string, any> = {}
  ) {
    this.selectorLadder = new SelectorLadder(page);
    this.stateMachine = new StateMachine(recipe.id, initialUserData);
  }

  getStateMachine(): StateMachine {
    return this.stateMachine;
  }

  /**
   * Executes the entire recipe deterministically
   */
  async execute(): Promise<{ success: boolean; error?: string; stepsCompleted: number }> {
    this.stateMachine.transition('RUNNING');
    let stepsCompleted = 0;

    try {
      for (let i = 0; i < this.recipe.steps.length; i++) {
        const step = this.recipe.steps[i];
        this.stateMachine.transition('RUNNING', { currentStepIndex: i });

        // 1. Safety Check (Destructive Step in Probe Mode)
        if (this.options.probeMode || step.destructive) {
          const safety = SafetyDetector.isDestructive(step.op);
          if (safety.isDestructive && this.options.probeMode) {
            console.log(`[Runtime] Probe mode hard-stop before destructive step ${step.id}: ${safety.reason}`);
            this.stateMachine.transition('SUCCESS');
            return { success: true, stepsCompleted };
          }
        }

        // 2. Pre-execution Page Fingerprint Check
        if (this.options.enableFingerprintChecks && step.pageFingerprint) {
          const currentFp = await PageFingerprinter.capture(this.page);
          if (!PageFingerprinter.isMatch(step.pageFingerprint, currentFp)) {
            console.warn(`[Runtime] Page drift detected at step ${step.id}. Expected ${step.pageFingerprint}, got ${currentFp.hash}`);
            if (this.options.onRepairRequired) {
              const patched = await this.options.onRepairRequired(step, new Error('Page structural drift detected'));
              if (patched) {
                this.recipe.steps[i] = patched;
              }
            }
          }
        }

        // 3. Execute Step
        const startTime = Date.now();
        try {
          await this.executeStep(step);
          stepsCompleted++;

          this.stateMachine.recordTelemetry({
            timestamp: new Date().toISOString(),
            stepId: step.id,
            opType: step.op.op,
            success: true,
            durationMs: Date.now() - startTime
          });
        } catch (err: any) {
          const durationMs = Date.now() - startTime;
          this.stateMachine.recordTelemetry({
            timestamp: new Date().toISOString(),
            stepId: step.id,
            opType: step.op.op,
            success: false,
            durationMs,
            error: err.message
          });

          // Attempt inline repair if handler is provided
          if (this.options.onRepairRequired) {
            this.stateMachine.transition('REPAIRING');
            const patched = await this.options.onRepairRequired(step, err);
            if (patched) {
              this.recipe.steps[i] = patched;
              await this.executeStep(patched);
              stepsCompleted++;
              this.stateMachine.transition('RUNNING');
              continue;
            }
          }

          throw err;
        }
      }

      this.stateMachine.transition('SUCCESS');
      return { success: true, stepsCompleted };
    } catch (error: any) {
      this.stateMachine.transition('FAILED');
      return { success: false, error: error.message, stepsCompleted };
    }
  }

  /**
   * Executes a single IR operation
   */
  async executeStep(step: RecipeStep): Promise<void> {
    const op = step.op;

    switch (op.op) {
      case 'goto': {
        await this.page.goto(op.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        break;
      }

      case 'click': {
        const res = await this.selectorLadder.resolve(op.target);
        await res.locator.click({
          button: op.button || 'left',
          clickCount: op.clickCount || 1,
          timeout: 10000
        });
        break;
      }

      case 'fill': {
        const resolvedValue = this.interpolateValue(op.value);
        const res = await this.selectorLadder.resolve(op.target);
        await res.locator.fill(resolvedValue, { timeout: 10000 });
        break;
      }

      case 'select': {
        const resolvedOption = this.interpolateValue(op.option);
        const res = await this.selectorLadder.resolve(op.target);
        await res.locator.selectOption({ label: resolvedOption }).catch(async () => {
          await res.locator.selectOption({ value: resolvedOption });
        });
        break;
      }

      case 'upload': {
        const filePath = op.filePath || this.stateMachine.getVariable(`$user.${op.fileKey}`);
        if (!filePath) {
          throw new Error(`Upload file path not found for key: ${op.fileKey}`);
        }
        const res = await this.selectorLadder.resolve(op.target);
        await res.locator.setInputFiles(filePath);
        break;
      }

      case 'wait_for': {
        const timeout = op.timeout || 10000;
        if (op.condition.urlContains) {
          await this.page.waitForURL(`**/*${op.condition.urlContains}*`, { timeout });
        } else if (op.condition.text) {
          await this.page.getByText(op.condition.text).waitFor({ timeout, state: op.condition.state || 'visible' });
        } else if (op.condition.selector) {
          await this.page.locator(op.condition.selector).waitFor({ timeout, state: op.condition.state || 'visible' });
        } else if (op.condition.target) {
          const res = await this.selectorLadder.resolve(op.condition.target, timeout);
          await res.locator.waitFor({ timeout, state: op.condition.state || 'visible' });
        }
        break;
      }

      case 'extract': {
        const res = await this.selectorLadder.resolve(op.target);
        const attr = op.attribute || 'textContent';
        let val = '';
        if (attr === 'textContent') {
          val = (await res.locator.textContent()) || '';
        } else if (attr === 'value') {
          val = (await res.locator.inputValue()) || '';
        } else {
          val = (await res.locator.getAttribute(attr)) || '';
        }

        if (op.regex) {
          const m = val.match(new RegExp(op.regex));
          val = m ? m[1] || m[0] : val;
        }

        this.stateMachine.setExtracted(op.saveAs, val.trim());
        break;
      }

      case 'assert': {
        let conditionMet = false;
        if (op.target) {
          const res = await this.selectorLadder.resolve(op.target);
          if (op.expected) {
            const text = (await res.locator.textContent()) || '';
            conditionMet = text.includes(op.expected);
          } else {
            conditionMet = await res.locator.isVisible();
          }
        } else if (op.condition === 'pdf_downloaded') {
          conditionMet = Boolean(this.stateMachine.getVariable('last_download_path'));
        }

        if (!conditionMet && op.onFail !== 'ignore') {
          throw new Error(`Assertion failed: ${op.condition} (target: ${JSON.stringify(op.target)})`);
        }
        break;
      }

      case 'handoff': {
        const timeoutSeconds = op.timeoutSeconds || 300;
        const handoffContext = {
          runId: this.stateMachine.getContext().runId,
          stepId: step.id,
          reason: op.reason,
          hint: op.hint,
          scopeSelector: op.scopeSelector,
          timeoutAt: Date.now() + timeoutSeconds * 1000
        };

        this.stateMachine.setHandoff(handoffContext);

        if (this.options.onHandoffRequired) {
          await new Promise<void>((resolve) => {
            this.options.onHandoffRequired!(step, () => {
              this.stateMachine.clearHandoff();
              resolve();
            });
          });
        }
        break;
      }

      case 'scroll': {
        const amount = op.amount || 400;
        if (op.direction === 'down') {
          await this.page.mouse.wheel(0, amount);
        } else if (op.direction === 'up') {
          await this.page.mouse.wheel(0, -amount);
        } else if (op.direction === 'top') {
          await this.page.evaluate(() => window.scrollTo(0, 0));
        } else if (op.direction === 'bottom') {
          await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        }
        break;
      }

      case 'download': {
        const downloadPromise = this.page.waitForEvent('download', { timeout: 20000 });
        const res = await this.selectorLadder.resolve(op.trigger);
        await res.locator.click();
        const download = await downloadPromise;
        const suggestedFilename = op.saveAs || download.suggestedFilename();
        const savePath = `./downloads/${Date.now()}_${suggestedFilename}`;
        await download.saveAs(savePath);
        this.stateMachine.setVariable('last_download_path', savePath);
        break;
      }

      default:
        throw new Error(`Unsupported IR operation: ${(op as any).op}`);
    }
  }

  private interpolateValue(val: string): string {
    if (val.startsWith('$')) {
      const resolved = this.stateMachine.getVariable(val);
      return resolved !== undefined ? String(resolved) : val;
    }
    return val;
  }
}
