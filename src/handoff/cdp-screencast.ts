import { Page, CDPSession } from 'playwright';

export interface ScreencastFrame {
  data: string; // base64 JPEG
  metadata: {
    offsetTop: number;
    pageScaleFactor: number;
    deviceWidth: number;
    deviceHeight: number;
    scrollOffsetX: number;
    scrollOffsetY: number;
    timestamp: number;
  };
}

export type FrameHandler = (frame: ScreencastFrame) => void;

export class CDPScreencastManager {
  private cdpSession: CDPSession | null = null;
  private isStreaming = false;
  private frameListeners: Set<FrameHandler> = new Set();

  constructor(private page: Page) {}

  async start(quality: number = 70): Promise<void> {
    if (this.isStreaming) return;

    this.cdpSession = await this.page.context().newCDPSession(this.page);

    this.cdpSession.on('Page.screencastFrame', async (params: any) => {
      // Acknowledge frame to receive next
      if (this.cdpSession) {
        await this.cdpSession.send('Page.screencastFrameAck', { sessionId: params.sessionId }).catch(() => {});
      }

      const frame: ScreencastFrame = {
        data: params.data,
        metadata: params.metadata
      };

      for (const listener of this.frameListeners) {
        try {
          listener(frame);
        } catch {
          // ignore individual listener failure
        }
      }
    });

    await this.cdpSession.send('Page.startScreencast', {
      format: 'jpeg',
      quality,
      everyNthFrame: 1
    });

    this.isStreaming = true;
  }

  async stop(): Promise<void> {
    if (!this.isStreaming || !this.cdpSession) return;
    try {
      await this.cdpSession.send('Page.stopScreencast');
      await this.cdpSession.detach();
    } catch {
      // ignore
    } finally {
      this.cdpSession = null;
      this.isStreaming = false;
    }
  }

  onFrame(handler: FrameHandler): () => void {
    this.frameListeners.add(handler);
    return () => this.frameListeners.delete(handler);
  }

  getCDPSession(): CDPSession | null {
    return this.cdpSession;
  }

  isActive(): boolean {
    return this.isStreaming;
  }
}
