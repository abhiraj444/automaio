export type ExecutionStatus = 
  | 'IDLE' 
  | 'RUNNING' 
  | 'WAITING_HUMAN' 
  | 'WAITING_INPUT' 
  | 'REPAIRING' 
  | 'PAUSED' 
  | 'SUCCESS' 
  | 'FAILED';

export interface TelemetryEvent {
  timestamp: string;
  stepId: string;
  opType: string;
  success: boolean;
  durationMs: number;
  selectorResolvedWith?: string; // which ladder level succeeded
  error?: string;
  healed?: boolean;
}

export interface HandoffContext {
  runId: string;
  stepId: string;
  reason: 'captcha' | 'otp' | 'payment' | 'ambiguous' | 'unknown';
  hint: string;
  scopeSelector?: string;
  timeoutAt: number; // epoch ms
  cdpEndpoint?: string;
}

export interface ExecutionContext {
  runId: string;
  recipeId: string;
  status: ExecutionStatus;
  currentStepIndex: number;
  userData: Record<string, any>;
  extractedData: Record<string, any>;
  variables: Record<string, any>;
  handoff?: HandoffContext;
  history: TelemetryEvent[];
  startedAt: string;
  finishedAt?: string;
}
