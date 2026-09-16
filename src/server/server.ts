import Fastify, { FastifyInstance } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';
import { SessionRegistry } from './session-registry.js';
import { PROVIDER_PRESETS, UniversalLLMProvider, AIProviderConfig } from '../ai/provider.js';
import { ExplorerAgent } from '../ai/explore.js';
import { RecipeStore } from '../store/recipe-store.js';
import { RuntimeEngine } from '../core/runtime.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ServerConfig {
  port?: number;
  host?: string;
  sessionRegistry?: SessionRegistry;
  recipeStore?: RecipeStore;
}

export function createAutomAIOServer(config: ServerConfig = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  const registry = config.sessionRegistry || new SessionRegistry();
  const recipeStore = config.recipeStore || new RecipeStore();

  app.register(fastifyWebsocket);
  
  app.register(fastifyStatic, {
    root: path.join(__dirname, 'static'),
    prefix: '/'
  });

  app.get('/api/health', async () => ({ status: 'ok', time: new Date().toISOString() }));
  app.get('/api/ai/presets', async () => PROVIDER_PRESETS);

  app.post('/api/ai/test', async (request) => {
    const body = request.body as Partial<AIProviderConfig>;
    const provider = new UniversalLLMProvider(body);
    return provider.testConnection();
  });

  app.get('/api/sessions', async () => registry.listActive());

  app.get('/session/:sessionId', async (request, reply) => {
    return reply.sendFile('index.html');
  });

  app.post('/api/tasks/start', async (request, reply) => {
    const body = request.body as {
      goal: string;
      url?: string;
      sessionId?: string;
      userData?: Record<string, any>;
      aiConfig?: Partial<AIProviderConfig>;
    };

    if (!body.goal) {
      return reply.status(400).send({ error: 'Goal is required' });
    }

    let session = body.sessionId ? registry.getSession(body.sessionId) : undefined;
    if (!session) {
      const active = registry.listActive()[0];
      session = active ? registry.getSession(active.sessionId) : undefined;
    }

    if (!session) {
      return reply.status(500).send({ error: 'No active browser session found' });
    }

    // Run task asynchronously
    (async () => {
      try {
        const provider = new UniversalLLMProvider(body.aiConfig || {});
        
        session.events.emit('log', {
          type: 'status',
          text: `Starting automation for: "${body.goal}"`
        });

        const canonicalKey = body.goal.toLowerCase().replace(/[^a-z0-9]/g, '.');
        const cachedRecipe = recipeStore.findByTaskKey(canonicalKey);

        if (cachedRecipe) {
          session.events.emit('log', {
            type: 'cache_hit',
            text: `Cache Hit! Running pre-compiled recipe "${cachedRecipe.name}" (0 LLM tokens, ultra-fast)`
          });

          const runtime = new RuntimeEngine(session.page, cachedRecipe, {
            onHandoffRequired: async (step, resume) => {
              session!.status = 'waiting_human';
              session!.instruction = (step.op as any).hint || 'Human action required';
              session!.onResolved = resume;
              session!.events.emit('log', {
                type: 'handoff',
                text: `Handoff requested: ${session!.instruction}`
              });
            }
          }, body.userData || {});

          const result = await runtime.execute();
          session.events.emit('log', {
            type: result.success ? 'done' : 'error',
            text: result.success ? `Workflow completed successfully (${result.stepsCompleted} steps)!` : `Execution error: ${result.error}`
          });
        } else {
          session.events.emit('log', {
            type: 'explore',
            text: `Launching Explore Mode using ${body.aiConfig?.provider || 'default'} AI...`
          });

          const explorer = new ExplorerAgent(session.page, provider);
          const compiledRecipe = await explorer.explore({
            initialUrl: body.url,
            taskGoal: body.goal,
            taskKey: canonicalKey,
            userData: body.userData,
            onLog: (type, text) => {
              session!.events.emit('log', { type, text });
            },
            onHandoffRequired: async (hint, resume) => {
              session!.status = 'waiting_human';
              session!.instruction = hint;
              session!.onResolved = resume;
              session!.events.emit('log', {
                type: 'handoff',
                text: `Handoff requested: ${hint}`
              });
            }
          });

          if (compiledRecipe.steps.length > 1) {
            await recipeStore.save(compiledRecipe);
            session.events.emit('log', {
              type: 'done',
              text: `Saved compiled recipe with ${compiledRecipe.steps.length} steps.`
            });
          }
        }
      } catch (err: any) {
        session.events.emit('log', {
          type: 'error',
          text: `Task failed: ${err.message}`
        });
      }
    })();

    return {
      success: true,
      sessionId: session.sessionId,
      message: 'Task initiated successfully'
    };
  });

  app.post('/api/handoff/resolve', async (request) => {
    const body = request.body as { sessionId?: string };
    if (body?.sessionId) {
      const session = registry.getSession(body.sessionId);
      if (session && session.onResolved) {
        session.onResolved();
        session.status = 'active';
        session.instruction = 'No intervention required. Automation running.';
        session.events.emit('log', {
          type: 'status',
          text: '✓ User marked handoff complete. Resuming...'
        });
      }
    }
    return { success: true };
  });

  app.register(async function (fastify) {
    fastify.get('/ws/screencast', { websocket: true }, (socket) => {
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

      const unsubscribeFrames = session.screencast.onFrame((frame) => {
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

      const logHandler = (logData: any) => {
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify({ type: 'log', data: logData }));
        }
      };
      session.events.on('log', logHandler);

      socket.on('message', async (message: any) => {
        try {
          const event = JSON.parse(message.toString());
          if (event.type === 'input') {
            await session.inputForwarder.dispatch(event.payload);
          } else if (event.type === 'done') {
            if (session.onResolved) {
              session.onResolved();
              session.status = 'active';
              session.instruction = 'No intervention required. Automation running.';
            }
          }
        } catch {}
      });

      socket.on('close', () => {
        unsubscribeFrames();
        session.events.off('log', logHandler);
      });
    }
  });

  return app;
}
