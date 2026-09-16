import { Page } from 'playwright';

export interface FormFieldDescriptor {
  name: string;
  label: string;
  type: string;
  required: boolean;
  maxLength?: number;
  pattern?: string;
  options?: string[];
  placeholder?: string;
}

export interface ScannedFormSchema {
  formId: string;
  title: string;
  fields: FormFieldDescriptor[];
}

export class FormProber {
  /**
   * Scans a form non-destructively, extracting input constraints, maxlengths, patterns and options
   */
  static async probeForm(page: Page): Promise<ScannedFormSchema> {
    const rawForm = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), select, textarea'));
      
      const fields = inputs.map(el => {
        const inputEl = el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
        const id = inputEl.id;
        let label = '';
        if (id) {
          const l = document.querySelector(`label[for="${id}"]`);
          if (l) label = l.textContent?.trim() || '';
        }
        if (!label) {
          label = inputEl.closest('label')?.textContent?.trim() || '';
        }
        if (!label) {
          label = inputEl.getAttribute('aria-label') || inputEl.getAttribute('placeholder') || inputEl.name || 'Field';
        }

        const type = el.tagName.toLowerCase() === 'select' 
          ? 'select' 
          : (el.tagName.toLowerCase() === 'textarea' ? 'textarea' : (inputEl as HTMLInputElement).type || 'text');

        let options: string[] | undefined;
        if (el.tagName.toLowerCase() === 'select') {
          options = Array.from((el as HTMLSelectElement).options).map(o => o.text.trim()).filter(Boolean);
        }

        return {
          name: inputEl.name || inputEl.id || `field_${Math.random().toString(36).substring(2, 6)}`,
          label: label.replace(/\s+/g, ' ').trim(),
          type,
          required: (inputEl as any).required || inputEl.getAttribute('aria-required') === 'true',
          maxLength: (inputEl as any).maxLength > 0 ? (inputEl as any).maxLength : undefined,
          pattern: inputEl.getAttribute('pattern') || undefined,
          placeholder: inputEl.getAttribute('placeholder') || undefined,
          options
        };
      });

      return {
        title: document.title || 'Application Form',
        fields
      };
    });

    return {
      formId: `form_${Date.now()}`,
      title: rawForm.title,
      fields: rawForm.fields
    };
  }
}
