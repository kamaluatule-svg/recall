import { createServer } from 'node:http';
import { createApp } from './app.js';
import { createFirebaseVerifier } from './auth/firebase.js';
import { loadConfig } from './config.js';
import { createRepository } from './db/repository.js';
import { createSupabase } from './db/supabase.js';

const config = loadConfig();
const db = createSupabase({ url: config.supabaseUrl, serviceKey: config.supabaseServiceKey });
const repo = createRepository(db, { maxDecks: config.maxDecksPerUser, maxCards: config.maxCardsPerDeck });
const verifyIdToken = createFirebaseVerifier({ projectId: config.firebaseProjectId });
const app = createApp({ config, verifyIdToken, repo });

const server = createServer(app.handle);
server.requestTimeout = 30_000;
server.listen(config.port, '0.0.0.0', () => {
  console.log(JSON.stringify({ level: 'info', msg: 'listening', port: config.port, env: config.env }));
});

// Render sends SIGTERM on deploys: finish in-flight requests, then exit.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    app.stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
