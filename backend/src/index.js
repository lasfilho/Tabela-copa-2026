import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import apiRouter from './routes/api.js';
import { initDatabase } from './seed.js';
import { startScoreSyncWorker } from './score-sync.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../..');
const PORT = process.env.PORT || 8080;

const app = express();
app.use(express.json());

app.use('/api', apiRouter);

// Frontend estático (mantém o visual existente)
app.use(express.static(ROOT));

app.get('/', (_req, res) => {
  res.sendFile(path.join(ROOT, 'copa-2026-dashboard.html'));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Erro interno' });
});

async function start() {
  await initDatabase();
  await startScoreSyncWorker();
  app.listen(PORT, () => {
    console.log(`Copa 2026 rodando em http://localhost:${PORT}`);
  });
}

start();
