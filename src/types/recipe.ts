import { z } from 'zod';
import { IROpSchema } from './ir.js';

export const RecipeStepSchema = z.object({
  id: z.string(),
  op: IROpSchema,
  description: z.string().optional(),
  destructive: z.boolean().default(false).optional(),
  pageFingerprint: z.string().optional(),
  rollbackHint: z.string().optional()
});

export type RecipeStep = z.infer<typeof RecipeStepSchema>;

export const RecipeSchema = z.object({
  id: z.string(),
  taskKey: z.string(), // Normalized key: e.g. "ssc.cgl.admit_card"
  name: z.string(),
  siteDomain: z.string(),
  version: z.number().int().default(1),
  parentVersion: z.number().int().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  sessionTTLSeconds: z.number().default(900), // Portal session expiration
  inputSchema: z.record(z.any()).default({}), // What user data is needed
  outputSchema: z.record(z.any()).default({}),
  steps: z.array(RecipeStepSchema),
  subRecipes: z.array(z.string()).default([]),
  successCount: z.number().int().default(0),
  failCount: z.number().int().default(0),
  lastSuccessAt: z.string().optional(),
  canaryStatus: z.enum(['healthy', 'degraded', 'broken']).default('healthy')
});

export type Recipe = z.infer<typeof RecipeSchema>;
