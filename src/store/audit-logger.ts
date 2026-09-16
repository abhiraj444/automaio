import { TelemetryEvent } from '../types/state.js';

export interface AuditRecord {
  runId: string;
  recipeId: string;
  timestamp: string;
  events: TelemetryEvent[];
  submittedPayloadHash?: string;
  userApprovedAt?: string;
}

export class AuditLogger {
  private static SENSITIVE_KEYS = ['password', 'otp', 'pin', 'cvv', 'aadhar', 'reg_password'];

  static redact(data: any): any {
    if (!data) return data;
    if (typeof data === 'string') return data;
    if (Array.isArray(data)) return data.map(item => this.redact(item));

    const copy = { ...data };
    for (const key of Object.keys(copy)) {
      const lowerKey = key.toLowerCase();
      if (this.SENSITIVE_KEYS.some(s => lowerKey.includes(s))) {
        copy[key] = '***REDACTED***';
      } else if (typeof copy[key] === 'object') {
        copy[key] = this.redact(copy[key]);
      }
    }
    return copy;
  }
}
