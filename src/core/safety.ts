import { IROp, SemanticTarget } from '../types/ir.js';

export interface DestructiveCheckResult {
  isDestructive: boolean;
  reason?: string;
  matchedKeyword?: string;
}

export class SafetyDetector {
  private static DESTRUCTIVE_KEYWORDS = [
    'final submit',
    'pay now',
    'proceed to pay',
    'make payment',
    'confirm payment',
    'submit application',
    'finalize',
    'agree and submit',
    'declare and submit',
    'lock registration',
    'delete account',
    'irreversible'
  ];

  /**
   * Checks if an action or target text corresponds to a point-of-no-return
   */
  static isDestructive(op: IROp, targetText?: string): DestructiveCheckResult {
    // 1. Explicitly marked destructive in target/op
    if (op.op === 'click') {
      const candidates = [
        targetText,
        op.target.text,
        op.target.name,
        op.target.id,
        op.target.nameAttr
      ].filter((x): x is string => Boolean(x));

      for (const text of candidates) {
        const lower = text.toLowerCase();
        for (const kw of this.DESTRUCTIVE_KEYWORDS) {
          if (lower.includes(kw)) {
            return {
              isDestructive: true,
              reason: `Target element matched destructive keyword "${kw}"`,
              matchedKeyword: kw
            };
          }
        }
      }
    }

    return { isDestructive: false };
  }
}
