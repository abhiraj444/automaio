import { FormFieldDescriptor, ScannedFormSchema } from './prober.js';

export interface MiniAppSchema {
  id: string;
  title: string;
  fields: Array<FormFieldDescriptor & {
    autoFilledValue?: any;
    confidence?: number;
    sourceDocument?: string;
  }>;
}

export class MiniAppSchemaBuilder {
  /**
   * Compiles scanned portal schema and enriches it with pre-fills from extracted user documents
   */
  static build(
    scanned: ScannedFormSchema,
    userVaultData: Record<string, any> = {}
  ): MiniAppSchema {
    const enrichedFields = scanned.fields.map(field => {
      let autoFilledValue: any = undefined;
      let confidence = 0;
      let sourceDocument = '';

      const labelLower = field.label.toLowerCase();
      const nameLower = field.name.toLowerCase();

      // Heuristic field matching against user vault
      if (labelLower.includes('name') && !labelLower.includes('father') && !labelLower.includes('mother')) {
        autoFilledValue = userVaultData.full_name || userVaultData.name;
        confidence = 0.95;
        sourceDocument = 'aadhar_card';
      } else if (labelLower.includes('father')) {
        autoFilledValue = userVaultData.father_name;
        confidence = 0.92;
        sourceDocument = 'aadhar_card';
      } else if (labelLower.includes('dob') || labelLower.includes('birth')) {
        autoFilledValue = userVaultData.dob || userVaultData.date_of_birth;
        confidence = 0.98;
        sourceDocument = 'aadhar_card';
      } else if (labelLower.includes('mobile') || labelLower.includes('phone')) {
        autoFilledValue = userVaultData.mobile || userVaultData.phone;
        confidence = 0.99;
        sourceDocument = 'user_profile';
      } else if (labelLower.includes('email')) {
        autoFilledValue = userVaultData.email;
        confidence = 0.99;
        sourceDocument = 'user_profile';
      } else if (labelLower.includes('aadhar') || labelLower.includes('aadhaar')) {
        autoFilledValue = userVaultData.aadhar_number;
        confidence = 0.99;
        sourceDocument = 'aadhar_card';
      }

      // Fuzzy dropdown mapping if options are available
      if (field.type === 'select' && field.options && autoFilledValue) {
        const match = this.fuzzyMatchOption(autoFilledValue, field.options);
        if (match) {
          autoFilledValue = match;
        }
      }

      return {
        ...field,
        autoFilledValue,
        confidence,
        sourceDocument
      };
    });

    return {
      id: scanned.formId,
      title: scanned.title,
      fields: enrichedFields
    };
  }

  /**
   * Fuzzy matches extracted string (e.g. "B.Tech") with dropdown option (e.g. "B.E./B.Tech")
   */
  private static fuzzyMatchOption(val: string, options: string[]): string | undefined {
    const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const targetClean = clean(val);

    for (const opt of options) {
      const optClean = clean(opt);
      if (optClean === targetClean || optClean.includes(targetClean) || targetClean.includes(optClean)) {
        return opt;
      }
    }
    return undefined;
  }
}
