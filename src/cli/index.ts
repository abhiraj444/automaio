import { chromium } from 'playwright';
import { createAutomAIOServer } from '../server/server.js';
import { SessionRegistry } from '../server/session-registry.js';
import { RecipeStore } from '../store/recipe-store.js';
import { RuntimeEngine } from '../core/runtime.js';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'serve';

  if (command === 'serve') {
    const port = parseInt(process.env.PORT || '3000', 10);
    const host = process.env.HOST || '127.0.0.1';

    console.log(`[AutomAIO] Launching headless browser session...`);
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    await page.goto('https://example.com');

    const sessionRegistry = new SessionRegistry();
    const defaultSession = await sessionRegistry.createSession(page, 'initial_session', 'Default Browser Session');
    console.log(`[AutomAIO] Default session created: ${defaultSession.sessionId}`);
    console.log(`[AutomAIO] Shareable URL: http://${host}:${port}/session/${defaultSession.sessionId}?token=${defaultSession.token}`);

    const app = createAutomAIOServer({
      port,
      host,
      sessionRegistry
    });

    await app.listen({ port, host });
    console.log(`[AutomAIO] Live Handoff Server running at: http://${host}:${port}`);
  } else if (command === 'run') {
    const recipeId = args[1];
    if (!recipeId) {
      console.error('Usage: automaio run <recipeId>');
      process.exit(1);
    }
    const store = new RecipeStore();
    await store.init();
    const recipe = store.get(recipeId);
    if (!recipe) {
      console.error(`Recipe not found: ${recipeId}`);
      process.exit(1);
    }

    console.log(`[AutomAIO] Executing recipe: ${recipe.name} (${recipe.taskKey})...`);
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();
    const runtime = new RuntimeEngine(page, recipe);
    const res = await runtime.execute();
    console.log(`[AutomAIO] Execution finished:`, res);
    await browser.close();
  } else {
    console.log(`AutomAIO CLI:`);
    console.log(`  serve       - Launch Web Server with live CDP screencast`);
    console.log(`  run <id>    - Deterministically execute a recipe by ID`);
  }
}

main().catch(err => {
  console.error('[AutomAIO] Fatal error:', err);
  process.exit(1);
});
