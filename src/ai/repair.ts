import { Page } from 'playwright';
import { RecipeStep } from '../types/recipe.js';
import { LLMProvider } from './provider.js';
import { DOMPruner } from '../perception/dom-pruner.js';
import { IROpSchema } from '../types/ir.js';

export class RepairAgent {
  constructor(private page: Page, private llm: LLMProvider) {}

  /**
   * Patches a broken recipe step with a single targeted LLM call
   */
  async repairStep(brokenStep: RecipeStep, error: Error): Promise<RecipeStep | null> {
    const dom = await DOMPruner.capture(this.page);

    const prompt = `
[REPAIR_MODE]
A recipe step failed during execution.

Broken Step:
${JSON.stringify(brokenStep, null, 2)}

Error Message:
${error.message}

Current Interactive Elements on Page:
${dom.representationText}

Goal: Output the patched RecipeStep with corrected target selectors.
Respond ONLY with JSON:
{
  "patchedStep": {
    "id": "${brokenStep.id}",
    "op": { ... }
  }
}
`;

    try {
      const response = await this.llm.chat([
        {
          role: 'system',
          content: 'You are AutomAIO Self-Healing Engine. Fix broken automation selectors with high precision.'
        },
        {
          role: 'user',
          content: prompt
        }
      ], 'frontier');

      let parsed: any;
      try {
        parsed = JSON.parse(response.content);
      } catch {
        const match = response.content.match(/\{[\s\S]*\}/);
        parsed = match ? JSON.parse(match[0]) : null;
      }

      if (parsed && parsed.patchedStep && parsed.patchedStep.op) {
        parsed.patchedStep.op = IROpSchema.parse(parsed.patchedStep.op);
        return parsed.patchedStep as RecipeStep;
      }
    } catch (err) {
      console.error('[RepairAgent] Failed to repair step:', err);
    }

    return null;
  }
}
