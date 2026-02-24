import 'dotenv/config';
import express from 'express';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';

import { connectDb } from './db.js';
import { catsRouter } from './routes/cats.js';
import { mountMcp } from './mcp/mountMcp.js';

const PORT = Number(process.env.PORT || 3000);
const NODE_ENV = process.env.NODE_ENV || 'development';

const extraAllowedHosts = [
  process.env.RENDER_EXTERNAL_HOSTNAME,
  ...(process.env.ALLOWED_HOSTS || '').split(','),
]
  .map((s) => s?.trim())
  .filter(Boolean);

const mcpAppOptions =
  extraAllowedHosts.length > 0
    ? {
        host: '0.0.0.0',
        allowedHosts: [...new Set(['localhost', '127.0.0.1', '[::1]', ...extraAllowedHosts])],
      }
    : NODE_ENV === 'production'
      ? { host: '0.0.0.0' }
      : { host: '127.0.0.1' };

await connectDb();

const app = createMcpExpressApp(mcpAppOptions);

app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/.well-known/oauth-authorization-server', (_req, res) => {
  res.json({
  "resource": "https://mcptest-ud4i.onrender.com",
  "authorization_servers": ["https://mcptest-ud4i.onrender.com"],
  "scopes_supported": ["mcp.access"]
});
});
app.get('/.well-known/openid-configuration', (_req, res) => {
  res.json({
    issuer: 'https://mcptest-ud4i.onrender.com',
    authorization_endpoint:
      'https://login.microsoftonline.com/463f5aca-3098-440c-a795-9819035e156f/oauth2/v2.0/authorize',
    token_endpoint:
      'https://login.microsoftonline.com/463f5aca-3098-440c-a795-9819035e156f/oauth2/v2.0/token',
    registration_endpoint: 'https://mcptest-ud4i.onrender.com/register',
    code_challenge_methods_supported: ['S256'],
  });
});

app.use('/api/cats', catsRouter);

mountMcp(app);

app.listen(PORT, (err) => {
  if (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
  console.log(`HTTP listening on port ${PORT}`);
  console.log(`REST  -> /api/cats`);
  console.log(`MCP   -> /mcp`);
  if (extraAllowedHosts.length > 0) {
    console.log(`MCP allowed hosts: ${mcpAppOptions.allowedHosts.join(', ')}`);
  }
});
