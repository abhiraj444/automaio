import { Page } from 'playwright';
import { LLMProvider } from './provider.js';
import { A11yExtractor } from '../perception/a11y.js';
import { DOMPruner } from '../perception/dom-pruner.js';
import { SetOfMarkAnnotator } from '../perception/set-of-mark.js';
import { IROp, IROpSchema } from '../types/ir.js';
import { Recipe, RecipeStep } from '../types/recipe.js';
import { RuntimeEngine } from '../core/runtime.js';
import { PageFingerprinter } from '../core/fingerprinter.js';

export interface ExploreOptions {
  maxSteps?: number;
  initialUrl?: string;
  taskGoal: string;
  taskKey: string;
  userData?: Record<string, any>;
}

/**
 * Resilient JSON parser for reasoning models (DeepSeek R1, Claude, OpenAI)
 * that handles <think> tags, markdown code blocks, trailing commas, and unquoted keys.
 */
export function parseLLMJSON(raw: string): any {
  if (!raw) return null;

  // 1. Strip reasoning / thinking tags (e.g. DeepSeek R1 <think>...</think>)
  let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // 2. Extract from markdown code blocks if present
  const markdownMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (markdownMatch && markdownMatch[1]) {
    cleaned = markdownMatch[1].trim();
  }

  // 3. Extract the main JSON object boundary
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }

  // Direct parse attempt
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    // Attempt repairs:
    // a. Remove trailing commas before } or ]
    let repaired = cleaned.replace(/,\s*([\}\]])/g, '$1');

    // b. Fix unquoted keys: { key: "value" } -> { "key": "value" }
    repaired = repaired.replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');

    // c. Replace single quotes around strings
    repaired = repaired.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"');

    try {
      return JSON.parse(repaired);
    } catch (secondErr) {
      console.warn('[parseLLMJSON] Failed to parse model output:', raw.substring(0, 300));
      return null;
    }
  }
}

export class ExplorerAgent {
  constructor(private page: Page, private llm: LLMProvider) {}

  /**
   * Explores starting from Google or direct URL, compiling actions into a verified Recipe
   */
  async explore(options: ExploreOptions): Promise<Recipe> {
    const steps: RecipeStep[] = [];
    const maxSteps = options.maxSteps || 12;

    // If no URL is provided, start directly from Google search
    const startUrl = options.initialUrl && options.initialUrl.startsWith('http')
      ? options.initialUrl
      : `https://www.google.com/search?q=${encodeURIComponent(options.taskGoal)}`;

    await this.page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    steps.push({
      id: 'step_1_init',
      op: { op: 'goto', url: startUrl },
      description: `Navigate to initial page: ${startUrl}`
    });

    let siteDomain = 'google.com';
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
      // 1. Perception Cost Ladder
      const dom = await DOMPruner.capture(this.page);
      const a11y = await A11yExtractor.capture(this.page);

      // Level 3 screenshot if page is complex
      let screenshotB64: string | undefined;
      if (dom.elements.length > 40 || a11y.tokenEstimate > 1200) {
        try {
          const somBuffer = await SetOfMarkAnnotator.captureAnnotatedScreenshot(this.page, dom.elements.slice(0, 30));
          screenshotB64 = somBuffer.toString('base64');
        } catch {}
      }

      // 2. Context Prompt
      const fp = await PageFingerprinter.capture(this.page);
      const prompt = `
Goal: "${options.taskGoal}"
Current Step: ${i + 1}
Current URL: ${this.page.url()}
Current Page Title: ${dom.title}

Interactive Elements:
${dom.representationText.substring(0, 3500)}

Determine the next best action to progress towards the goal.
If on Google search results, choose the most relevant link.
If the goal is already achieved, set "goalAchieved": true.

CRITICAL: Return ONLY raw JSON without markdown backticks:
{
  "thought": "I will click the first search result for...",
  "goalAchieved": false,
  "nextOp": {
    "op": "click" | "fill" | "select" | "wait_for" | "download" | "handoff",
    "target": {
      "role": "link" | "button" | "textbox",
      "name": "Exact text or accessible name",
      "id": "optional-element-id",
      "nearText": "optional label text"
    },
    "value": "text to type if fill"
  }
}
`;

      const response = await this.llm.chat([
        {
          role: 'system',
          content: 'You are AutomAIO, an autonomous browser compiler. You output pure JSON actions.'
        },
        {
          role: 'user',
          content: prompt,
          images: screenshotB64 ? [screenshotB64] : undefined
        }
      ], 'frontier');

      const parsed = parseLLMJSON(response.content);

      if (!parsed || !parsed.nextOp) {
        console.warn(`[ExplorerAgent] Could not parse action at step ${i + 1}. Model output:`, response.content);
        break;
      }

      if (parsed.goalAchieved) {
        console.log(`[ExplorerAgent] Goal achieved at step ${i + 1}!`);
        break;
      }

      // Validate operation with Zod schema
      let validatedOp: IROp;
      try {
        validatedOp = IROpSchema.parse(parsed.nextOp);
      } catch (err: any) {
        console.warn(`[ExplorerAgent] Schema validation failed for op:`, parsed.nextOp, err.message);
        break;
      }

      const newStep: RecipeStep = {
        id: `step_${steps.length + 1}_${validatedOp.op}`,
        op: validatedOp,
        description: parsed.thought,
        pageFingerprint: fp.hash
      };

      // Execute action to advance the browser
      try {
        await runtime.executeStep(newStep);
        await this.page.waitForTimeout(1500); // let page settle
        steps.push(newStep);
      } catch (execErr: any) {
        console.warn(`[ExplorerAgent] Step execution failed: ${execErr.message}`);
        break;
      }
    }

    dummyRecipe.steps = steps;
    return dummyRecipe;
  }
}
