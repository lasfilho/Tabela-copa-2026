import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import apiRouter from './routes/api.js';
import authRouter from './routes/auth.js';
import poolsRouter from './routes/pools.js';
import publicPoolsRouter from './routes/public-pools.js';
import stickersRouter from './routes/stickers.js';
import adminRouter from './routes/admin.js';
import { initDatabase } from './seed.js';
import { startScoreSyncWorker } from './score-sync.js';
import { auditMiddleware } from './audit-middleware.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../..');
const PORT = process.env.PORT || 8080;

const app = express();
app.use(express.json());

app.use('/api', auditMiddleware);

app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/pools', poolsRouter);
app.use('/api/public', publicPoolsRouter);
app.use('/api/stickers', stickersRouter);
app.use('/api', apiRouter);

// Frontend estático (mantém o visual existente)
app.use(express.static(ROOT, {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.js') || filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

app.get('/', (_req, res) => {
  res.sendFile(path.join(ROOT, 'copa-2026-dashboard.html'));
});

app.get('/login', (_req, res) => {
  res.sendFile(path.join(ROOT, 'auth.html'));
});

app.get('/boloes', (_req, res) => {
  res.sendFile(path.join(ROOT, 'boloes.html'));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Erro interno' });
});

async function start() {
  await initDatabase();
  app.listen(PORT, () => {
    console.log(`Copa 2026 rodando em http://localhost:${PORT}`);
  });
  await startScoreSyncWorker();
}

start();
