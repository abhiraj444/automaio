import { Page } from 'playwright';

export interface CaptchaDetectionResult {
  detected: boolean;
  type?: 'recaptcha' | 'hcaptcha' | 'cloudflare' | 'image_puzzle' | 'generic_bot';
  hint?: string;
}

export class CaptchaDetector {
  /**
   * Fast, multi-signal scanner for Bot Detection and CAPTCHA challenges
   */
  static async scan(page: Page): Promise<CaptchaDetectionResult> {
    try {
      const result = await page.evaluate(() => {
        const bodyText = document.body?.innerText?.toLowerCase() || '';
        const title = document.title?.toLowerCase() || '';

        // 1. Google reCAPTCHA detection
        const hasRecaptchaIframe = Boolean(
          document.querySelector('iframe[src*="recaptcha"], iframe[title*="recaptcha"], iframe[title*="reCAPTCHA"], #recaptcha, .g-recaptcha')
        );
        const hasGoogleUnusualTraffic = bodyText.includes('unusual traffic from your computer network') ||
          bodyText.includes('our systems have detected unusual traffic') ||
          bodyText.includes('select all images with a') ||
          bodyText.includes('click verify once there are none left');

        if (hasRecaptchaIframe || hasGoogleUnusualTraffic) {
          return {
            detected: true,
            type: 'recaptcha' as const,
            hint: 'Google Bot Detection / reCAPTCHA active. Please solve the image puzzle above.'
          };
        }

        // 2. Cloudflare Challenge / Turnstile detection
        const hasCloudflare = Boolean(
          document.querySelector('iframe[src*="challenges.cloudflare.com"], .cf-turnstile, #challenge-form')
        );
        const hasCloudflareText = title.includes('just a moment') ||
          title.includes('attention required') ||
          bodyText.includes('verify you are human') ||
          bodyText.includes('performing security check');

        if (hasCloudflare || hasCloudflareText) {
          return {
            detected: true,
            type: 'cloudflare' as const,
            hint: 'Cloudflare security check active. Please click the checkbox to verify.'
          };
        }

        // 3. hCaptcha detection
        const hasHcaptcha = Boolean(
          document.querySelector('iframe[src*="hcaptcha"], .h-captcha')
        );
        if (hasHcaptcha) {
          return {
            detected: true,
            type: 'hcaptcha' as const,
            hint: 'hCaptcha challenge active. Please solve the challenge.'
          };
        }

        return { detected: false };
      });

      return result;
    } catch {
      return { detected: false };
    }
  }
}
