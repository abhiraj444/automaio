import Fastify, { FastifyInstance } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';
import { SessionRegistry } from './session-registry.js';
import { PROVIDER_PRESETS, UniversalLLMProvider, AIProviderConfig } from '../ai/provider.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ServerConfig {
  port?: number;
  host?: string;
  sessionRegistry?: SessionRegistry;
}

export function createAutomAIOServer(config: ServerConfig = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  const registry = config.sessionRegistry || new SessionRegistry();

  app.register(fastifyWebsocket);
  
  app.register(fastifyStatic, {
    root: path.join(__dirname, 'static'),
    prefix: '/'
  });

  // REST API Routes
  app.get('/api/health', async () => ({ status: 'ok', time: new Date().toISOString() }));

  // AI Provider Presets and Connection Tester
  app.get('/api/ai/presets', async () => PROVIDER_PRESETS);

  app.post('/api/ai/test', async (request) => {
    const body = request.body as Partial<AIProviderConfig>;
    const provider = new UniversalLLMProvider(body);
    return provider.testConnection();
  });

  // Active Sessions & Random URL Generation
  app.get('/api/sessions', async () => registry.listActive());

  app.get('/session/:sessionId', async (request, reply) => {
    // Serve the live viewer HTML
    return reply.sendFile('index.html');
  });

  app.post('/api/handoff/resolve', async (request) => {
    const body = request.body as { sessionId?: string; runId?: string };
    if (body?.sessionId) {
      const session = registry.getSession(body.sessionId);
      if (session && session.onResolved) {
        session.onResolved();
        session.status = 'active';
      }
    }
    return { success: true };
  });

  // WebSocket for real-time CDP Screencast & remote input forwarding
  // Supports both direct stream and session-isolated stream /ws/screencast/:sessionId
  app.register(async function (fastify) {
    fastify.get('/ws/screencast', { websocket: true }, (socket, req) => {
      // Connect to first active session if available
      const active = registry.listActive()[0];
      if (active) {
        handleSessionSocket(socket, active.sessionId, active.token);
      }
    });

    fastify.get('/ws/screencast/:sessionId', { websocket: true }, (socket, req) => {
      const { sessionId } = req.params as { sessionId: string };
      const url = new URL(req.url, 'http://localhost');
      const token = url.searchParams.get('token') || '';
      handleSessionSocket(socket, sessionId, token);
    });

    function handleSessionSocket(socket: any, sessionId: string, token?: string) {
      const session = registry.getSession(sessionId);
      if (!session) {
        socket.send(JSON.stringify({ type: 'error', message: 'Session not found or expired' }));
        socket.close();
        return;
      }

      // 1. Subscribe to screencast frames and forward to client
      const unsubscribe = session.screencast.onFrame((frame) => {
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify({
            type: 'frame',
            data: frame.data,
            metadata: frame.metadata,
            status: session.status,
            instruction: session.instruction
          }));
        }
      });

      // 2. Receive remote mouse/key events from client and forward to browser
      socket.on('message', async (message: any) => {
        try {
          const event = JSON.parse(message.toString());
          if (event.type === 'input') {
            await session.inputForwarder.dispatch(event.payload);
          } else if (event.type === 'done') {
            if (session.onResolved) {
              session.onResolved();
              session.status = 'active';
            }
          }
        } catch {
          // ignore
        }
      });

      socket.on('close', () => {
        unsubscribe();
      });
    }
  });

  return app;
}
