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
  initialUrl: string;
  taskGoal: string;
  taskKey: string;
  userData?: Record<string, any>;
}

export class ExplorerAgent {
  constructor(private page: Page, private llm: LLMProvider) {}

  /**
   * Explores a site to accomplish taskGoal, recording each action into a compiled Recipe
   */
  async explore(options: ExploreOptions): Promise<Recipe> {
    const steps: RecipeStep[] = [];
    const maxSteps = options.maxSteps || 10;
    
    // Initial navigation
    await this.page.goto(options.initialUrl, { waitUntil: 'domcontentloaded' });
    steps.push({
      id: 'step_1_init',
      op: { op: 'goto', url: options.initialUrl }
    });

    const dummyRecipe: Recipe = {
      id: `recipe_${Date.now()}`,
      taskKey: options.taskKey,
      name: options.taskGoal,
      siteDomain: new URL(options.initialUrl).hostname,
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
      // Level 1: A11y tree
      const a11y = await A11yExtractor.capture(this.page);
      
      // Level 2: Pruned DOM
      const dom = await DOMPruner.capture(this.page);

      // Level 3: Screenshot if needed (or for first / ambiguous steps)
      let screenshotB64: string | undefined;
      if (dom.elements.length > 50 || a11y.tokenEstimate > 1500) {
        const somBuffer = await SetOfMarkAnnotator.captureAnnotatedScreenshot(this.page, dom.elements);
        screenshotB64 = somBuffer.toString('base64');
      }

      // 2. Build Context Prompt
      const fp = await PageFingerprinter.capture(this.page);
      const prompt = `
Task Goal: ${options.taskGoal}
Current Step: ${i + 1}
Current URL: ${this.page.url()}

Page Perception (Pruned Interactive Elements):
${dom.representationText}

Respond ONLY with valid JSON in this structure:
{
  "thought": "brief reasoning",
  "goalAchieved": boolean,
  "nextOp": {
    "op": "click" | "fill" | "select" | "wait_for" | "download" | "handoff",
    "target": { "role": "...", "name": "...", "id": "...", "elementId": 12 },
    "value": "string or $user.variable"
  }
}
`;

      const response = await this.llm.chat([
        {
          role: 'system',
          content: 'You are AutomAIO Compiler. You navigate web forms and emit restricted IR operations.'
        },
        {
          role: 'user',
          content: prompt,
          images: screenshotB64 ? [screenshotB64] : undefined
        }
      ], 'frontier');

      let parsed: any;
      try {
        parsed = JSON.parse(response.content);
      } catch {
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      }

      if (!parsed || !parsed.nextOp) {
        break;
      }

      if (parsed.goalAchieved) {
        break;
      }

      // Validate operation against Zod schema
      const validatedOp: IROp = IROpSchema.parse(parsed.nextOp);
      
      const newStep: RecipeStep = {
        id: `step_${steps.length + 1}_${validatedOp.op}`,
        op: validatedOp,
        description: parsed.thought,
        pageFingerprint: fp.hash
      };

      // Execute action to move the page forward
      await runtime.executeStep(newStep);
      steps.push(newStep);
    }

    dummyRecipe.steps = steps;
    return dummyRecipe;
  }
}
