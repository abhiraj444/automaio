import { randomBytes } from 'crypto';
import { Page } from 'playwright';
import { CDPScreencastManager } from '../handoff/cdp-screencast.js';
import { RemoteInputForwarder } from '../handoff/input-forwarder.js';

export interface LiveSession {
  sessionId: string;
  token: string;
  runId: string;
  taskGoal: string;
  createdAt: string;
  expiresAt: number;
  page: Page;
  screencast: CDPScreencastManager;
  inputForwarder: RemoteInputForwarder;
  status: 'active' | 'waiting_human' | 'closed';
  instruction?: string;
  onResolved?: () => void;
}

export class SessionRegistry {
  private sessions: Map<string, LiveSession> = new Map();

  async createSession(
    page: Page,
    runId: string,
    taskGoal: string = 'AutomAIO Workflow',
    ttlSeconds: number = 1800
  ): Promise<LiveSession> {
    const sessionId = `sess_${randomBytes(8).toString('hex')}`;
    const token = `tok_${randomBytes(12).toString('hex')}`;

    const screencast = new CDPScreencastManager(page);
    await screencast.start(75);

    const inputForwarder = new RemoteInputForwarder(page, () => screencast.getCDPSession());

    const session: LiveSession = {
      sessionId,
      token,
      runId,
      taskGoal,
      createdAt: new Date().toISOString(),
      expiresAt: Date.now() + ttlSeconds * 1000,
      page,
      screencast,
      inputForwarder,
      status: 'active'
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  getSession(sessionId: string): LiveSession | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    if (Date.now() > session.expiresAt) {
      this.closeSession(sessionId);
      return undefined;
    }
    return session;
  }

  authenticate(sessionId: string, token: string): boolean {
    const session = this.getSession(sessionId);
    if (!session) return false;
    return session.token === token;
  }

  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      await session.screencast.stop().catch(() => {});
      session.status = 'closed';
      this.sessions.delete(sessionId);
    }
  }

  listActive(): Array<Omit<LiveSession, 'page' | 'screencast' | 'inputForwarder'>> {
    return Array.from(this.sessions.values()).map(s => ({
      sessionId: s.sessionId,
      token: s.token,
      runId: s.runId,
      taskGoal: s.taskGoal,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      status: s.status,
      instruction: s.instruction
    }));
  }
}
