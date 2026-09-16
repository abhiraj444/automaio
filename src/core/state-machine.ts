import { ExecutionContext, ExecutionStatus, TelemetryEvent, HandoffContext } from '../types/state.js';

export type StateChangeCallback = (ctx: ExecutionContext) => void;

export class StateMachine {
  private ctx: ExecutionContext;
  private listeners: StateChangeCallback[] = [];

  constructor(recipeId: string, userData: Record<string, any> = {}) {
    this.ctx = {
      runId: `run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      recipeId,
      status: 'IDLE',
      currentStepIndex: 0,
      userData,
      extractedData: {},
      variables: {},
      history: [],
      startedAt: new Date().toISOString()
    };
  }

  getContext(): ExecutionContext {
    return { ...this.ctx };
  }

  onStateChange(cb: StateChangeCallback) {
    this.listeners.push(cb);
  }

  private notify() {
    for (const cb of this.listeners) {
      cb(this.getContext());
    }
  }

  transition(newStatus: ExecutionStatus, metadata?: Partial<ExecutionContext>) {
    this.ctx.status = newStatus;
    if (metadata) {
      Object.assign(this.ctx, metadata);
    }
    if (newStatus === 'SUCCESS' || newStatus === 'FAILED') {
      this.ctx.finishedAt = new Date().toISOString();
    }
    this.notify();
  }

  recordTelemetry(event: TelemetryEvent) {
    this.ctx.history.push(event);
    this.notify();
  }

  setHandoff(handoff: HandoffContext) {
    this.ctx.handoff = handoff;
    this.transition('WAITING_HUMAN');
  }

  clearHandoff() {
    this.ctx.handoff = undefined;
    this.transition('RUNNING');
  }

  setVariable(key: string, value: any) {
    this.ctx.variables[key] = value;
  }

  setExtracted(key: string, value: any) {
    this.ctx.extractedData[key] = value;
  }

  getVariable(key: string): any {
    if (key.startsWith('$user.')) {
      const field = key.replace('$user.', '');
      return this.ctx.userData[field];
    }
    if (key.startsWith('$extracted.')) {
      const field = key.replace('$extracted.', '');
      return this.ctx.extractedData[field];
    }
    if (key.startsWith('$')) {
      const field = key.substring(1);
      return this.ctx.variables[field];
    }
    return key;
  }
}
