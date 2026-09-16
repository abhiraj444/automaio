import { z } from 'zod';

/**
 * 5-Tier Semantic Selector Target Specification
 */
export const SemanticTargetSchema = z.object({
  // Priority 1: Accessibility
  role: z.string().optional(),
  name: z.string().optional(),
  text: z.string().optional(),
  
  // Priority 2: Stable Attributes
  id: z.string().optional(),
  nameAttr: z.string().optional(),
  testId: z.string().optional(),
  placeholder: z.string().optional(),

  // Priority 3: Nearby Text Anchor
  nearText: z.string().optional(),

  // Priority 4: Positional / Role Query
  selector: z.string().optional(),

  // Priority 5: Raw XPath
  xpath: z.string().optional(),

  // Optional bounding token from pruned DOM (e.g. [17])
  elementId: z.number().optional()
});

export type SemanticTarget = z.infer<typeof SemanticTargetSchema>;

/**
 * Wait Conditions
 */
export const WaitConditionSchema = z.object({
  selector: z.string().optional(),
  target: SemanticTargetSchema.optional(),
  text: z.string().optional(),
  urlContains: z.string().optional(),
  state: z.enum(['attached', 'detached', 'visible', 'hidden']).default('visible'),
  any: z.array(z.string()).optional()
});

export type WaitCondition = z.infer<typeof WaitConditionSchema>;

/**
 * IR Operations
 */
export const GotoOpSchema = z.object({
  op: z.literal('goto'),
  url: z.string()
});

export const ClickOpSchema = z.object({
  op: z.literal('click'),
  target: SemanticTargetSchema,
  button: z.enum(['left', 'right', 'middle']).default('left').optional(),
  clickCount: z.number().int().min(1).default(1).optional()
});

export const FillOpSchema = z.object({
  op: z.literal('fill'),
  target: SemanticTargetSchema,
  value: z.string(),
  maskInLogs: z.boolean().default(false).optional()
});

export const SelectOpSchema = z.object({
  op: z.literal('select'),
  target: SemanticTargetSchema,
  option: z.string()
});

export const UploadOpSchema = z.object({
  op: z.literal('upload'),
  target: SemanticTargetSchema,
  fileKey: z.string(), // key from user document vault
  filePath: z.string().optional() // direct path fallback
});

export const WaitForOpSchema = z.object({
  op: z.literal('wait_for'),
  condition: WaitConditionSchema,
  timeout: z.number().int().positive().default(10000).optional()
});

export const ExtractOpSchema = z.object({
  op: z.literal('extract'),
  target: SemanticTargetSchema,
  attribute: z.string().default('textContent').optional(),
  saveAs: z.string(),
  regex: z.string().optional()
});

export const AssertOpSchema = z.object({
  op: z.literal('assert'),
  condition: z.string(),
  target: SemanticTargetSchema.optional(),
  expected: z.string().optional(),
  onFail: z.enum(['stop', 'repair', 'ignore']).default('repair')
});

export const HandoffOpSchema = z.object({
  op: z.literal('handoff'),
  reason: z.enum(['captcha', 'otp', 'payment', 'ambiguous', 'unknown']),
  hint: z.string(),
  scopeSelector: z.string().optional(),
  timeoutSeconds: z.number().int().default(300).optional()
});

export const ScrollOpSchema = z.object({
  op: z.literal('scroll'),
  direction: z.enum(['up', 'down', 'top', 'bottom']).default('down'),
  amount: z.number().int().default(400).optional()
});

export const BranchOpSchema = z.object({
  op: z.literal('branch'),
  condition: z.string(), // evaluated against state context
  then: z.string(), // sub-recipe or step label
  else: z.string().optional()
});

export const CallOpSchema = z.object({
  op: z.literal('call'),
  subRecipe: z.string(),
  args: z.record(z.any()).optional()
});

export const DownloadOpSchema = z.object({
  op: z.literal('download'),
  trigger: SemanticTargetSchema,
  expectedType: z.string().optional(),
  saveAs: z.string().optional()
});

export const IROpSchema = z.discriminatedUnion('op', [
  GotoOpSchema,
  ClickOpSchema,
  FillOpSchema,
  SelectOpSchema,
  UploadOpSchema,
  WaitForOpSchema,
  ExtractOpSchema,
  AssertOpSchema,
  HandoffOpSchema,
  ScrollOpSchema,
  BranchOpSchema,
  CallOpSchema,
  DownloadOpSchema
]);

export type IROp = z.infer<typeof IROpSchema>;
export type IROpType = IROp['op'];
