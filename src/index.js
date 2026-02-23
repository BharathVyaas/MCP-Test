import 'dotenv/config';
import express from 'express';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';

import { connectDb } from './db.js';
import { catsRouter } from './routes/cats.js';
import { mountMcp } from './mcp/mountMcp.js';

const PORT = Number(process.env.PORT || 3000);

await connectDb();

const app = createMcpExpressApp({ host: '127.0.0.1' });

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/cats', catsRouter);

mountMcp(app);

app.listen(PORT, (err) => {
  if (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
  console.log(`HTTP listening on http://127.0.0.1:${PORT}`);
  console.log(`REST  -> http://127.0.0.1:${PORT}/api/cats`);
  console.log(`MCP   -> http://127.0.0.1:${PORT}/mcp`);
});
