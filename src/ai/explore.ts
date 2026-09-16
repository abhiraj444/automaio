import { Page } from 'playwright';
import { LLMProvider } from './provider.js';
import { A11yExtractor } from '../perception/a11y.js';
import { DOMPruner } from '../perception/dom-pruner.js';
import { SetOfMarkAnnotator } from '../perception/set-of-mark.js';
import { IROp, IROpSchema } from '../types/ir.js';
import { Recipe, RecipeStep } from '../types/recipe.js';
import { RuntimeEngine } from '../core/runtime.js';
import { PageFingerprinter } from '../core/fingerprinter.js';
import { CaptchaDetector } from '../core/captcha-detector.js';

export interface ExploreOptions {
  maxSteps?: number;
  initialUrl?: string;
  taskGoal: string;
  taskKey: string;
  userData?: Record<string, any>;
  onLog?: (type: string, text: string) => void;
  onHandoffRequired?: (hint: string, resume: () => void) => Promise<void>;
}

/**
 * Normalizes user-entered URLs (adds https:// if missing, removes whitespace)
 */
export function normalizeUrl(rawUrl?: string): string | undefined {
  if (!rawUrl || !rawUrl.trim()) return undefined;
  let trimmed = rawUrl.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  }
  return trimmed;
}

export function parseLLMJSON(raw: string): any {
  if (!raw) return null;

  let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  const markdownMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (markdownMatch && markdownMatch[1]) {
    cleaned = markdownMatch[1].trim();
  }

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    let repaired = cleaned.replace(/,\s*([\}\]])/g, '$1');
    repaired = repaired.replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
    repaired = repaired.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"');

    try {
      return JSON.parse(repaired);
    } catch {
      return null;
    }
  }
}

export class ExplorerAgent {
  constructor(private page: Page, private llm: LLMProvider) {}

  async explore(options: ExploreOptions): Promise<Recipe> {
    const steps: RecipeStep[] = [];
    const maxSteps = options.maxSteps || 12;

    // Prioritize user-provided direct URL with normalization
    const normalizedDirect = normalizeUrl(options.initialUrl);
    const startUrl = normalizedDirect || `https://duckduckgo.com/?q=${encodeURIComponent(options.taskGoal)}`;

    if (options.onLog) {
      options.onLog('status', `Direct navigation to: ${startUrl}`);
    }

    await this.page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    steps.push({
      id: 'step_1_init',
      op: { op: 'goto', url: startUrl },
      description: `Navigate to initial page: ${startUrl}`
    });

    let siteDomain = 'web';
    try {
      siteDomain = new URL(startUrl).hostname;
    } catch {}

    const dummyRecipe: Recipe = {
      id: `recipe_${Date.now()}`,
      taskKey: options.taskKey,
      name: options.taskGoal,
      siteDomain,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sessionTTLSeconds: 900,
      inputSchema: {},
      outputSchema: {},
      steps: [],
      subRecipes: [],
      successCount: 0,
      failCount: 0,
      canaryStatus: 'healthy'
    };

    const runtime = new RuntimeEngine(this.page, dummyRecipe, {}, options.userData || {});

    for (let i = 0; i < maxSteps; i++) {
      // 1. Proactive Bot & CAPTCHA Detection
      const captcha = await CaptchaDetector.scan(this.page);
      if (captcha.detected) {
        const hint = captcha.hint || 'Bot detection or CAPTCHA active. Please solve in live preview.';
        if (options.onLog) {
          options.onLog('handoff', `⚠️ ${hint}`);
        }

        if (options.onHandoffRequired) {
          await new Promise<void>((resolve) => {
            options.onHandoffRequired!(hint, () => resolve());
          });
          if (options.onLog) {
            options.onLog('status', '✓ Handoff resolved. Waiting for page to settle and continuing...');
          }
          await this.page.waitForTimeout(2000);
        }
      }

      // 2. Perception Cost Ladder
      const dom = await DOMPruner.capture(this.page);
      const a11y = await A11yExtractor.capture(this.page);

      let screenshotB64: string | undefined;
      if (dom.elements.length > 40 || a11y.tokenEstimate > 1200) {
        try {
          const somBuffer = await SetOfMarkAnnotator.captureAnnotatedScreenshot(this.page, dom.elements.slice(0, 30));
          screenshotB64 = somBuffer.toString('base64');
        } catch {}
      }

      // 3. Prompting AI
      const fp = await PageFingerprinter.capture(this.page);
      const prompt = `
Goal: "${options.taskGoal}"
Current Step: ${i + 1}
Current URL: ${this.page.url()}
Current Page Title: ${dom.title}

Interactive Elements:
${dom.representationText.substring(0, 3500)}

Determine the next action to progress towards the goal.
If goal is achieved, set "goalAchieved": true.
If a CAPTCHA or bot check is present that you cannot solve, set op: "handoff", reason: "captcha".

CRITICAL: Return ONLY valid JSON:
{
  "thought": "I will click the link for...",
  "goalAchieved": false,
  "nextOp": {
    "op": "click" | "fill" | "select" | "wait_for" | "download" | "handoff",
    "reason": "captcha" | "otp" | "payment",
    "hint": "Please solve CAPTCHA",
    "target": {
      "role": "link" | "button" | "textbox",
      "name": "Exact text or accessible name",
      "id": "optional-id",
      "nearText": "optional label text"
    },
    "value": "text if fill"
  }
}
`;

      const response = await this.llm.chat([
        {
          role: 'system',
          content: 'You are AutomAIO autonomous browser compiler. You output pure JSON actions.'
        },
        {
          role: 'user',
          content: prompt,
          images: screenshotB64 ? [screenshotB64] : undefined
        }
      ], 'frontier');

      const parsed = parseLLMJSON(response.content);

      if (!parsed || !parsed.nextOp) {
        if (options.onLog) {
          options.onLog('status', `No next action decided. Ending exploration.`);
        }
        break;
      }

      if (parsed.goalAchieved) {
        if (options.onLog) {
          options.onLog('done', `🎉 Goal achieved!`);
        }
        break;
      }

      if (options.onLog) {
        options.onLog('explore', `Step ${i + 1}: ${parsed.thought || parsed.nextOp.op}`);
      }

      let validatedOp: IROp;
      try {
        validatedOp = IROpSchema.parse(parsed.nextOp);
      } catch (err: any) {
        if (options.onLog) {
          options.onLog('error', `Invalid op schema: ${err.message}`);
        }
        break;
      }

      const newStep: RecipeStep = {
        id: `step_${steps.length + 1}_${validatedOp.op}`,
        op: validatedOp,
        description: parsed.thought,
        pageFingerprint: fp.hash
      };

      try {
        await runtime.executeStep(newStep);
        await this.page.waitForTimeout(1500);
        steps.push(newStep);
      } catch (execErr: any) {
        if (options.onLog) {
          options.onLog('error', `Execution failed: ${execErr.message}`);
        }
        break;
      }
    }

    dummyRecipe.steps = steps;
    return dummyRecipe;
  }
}
