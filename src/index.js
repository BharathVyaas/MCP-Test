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

const TENANT_ID = process.env.AZURE_TENANT_ID || '463f5aca-3098-440c-a795-9819035e156f';

const MCP_SERVICE_APP_ID =
  process.env.MCP_SERVICE_APP_ID || 'c600189c-5401-4bd7-9d45-e787222bb030';

const MCP_SCOPE =
  process.env.MCP_SCOPE || `api://${MCP_SERVICE_APP_ID}/mcp.access`;

const CHATGPT_CLIENT_ID =
  process.env.CHATGPT_CLIENT_ID || 'e206c9dc-1fd5-4f1c-97fb-e785ef875590';

const CHATGPT_REDIRECT_URIS = (
  process.env.CHATGPT_REDIRECT_URIS ||
  'https://chatgpt.com/connector_platform_oauth_redirect,https://platform.openai.com/apps-manage/oauth'
)
  .split(',')
  .map((s) => s?.trim())
  .filter(Boolean);

const REQUIRE_MCP_AUTH =
  (process.env.MCP_REQUIRE_AUTH || (NODE_ENV === 'production' ? '1' : '0')) === '1';

const AUTHORIZATION_ENDPOINT = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize`;
const TOKEN_ENDPOINT = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
const JWKS_URI = `https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`;

await connectDb();

const app = createMcpExpressApp(mcpAppOptions);

// Render/Reverse-proxy friendly URLs
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));

const getPublicBaseUrl = (req) => {
  const envBase = (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  if (envBase) return envBase;
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https')
    .toString()
    .split(',')[0]
    .trim();
  const host = (req.headers['x-forwarded-host'] || req.get('host') || '').toString().split(',')[0].trim();
  return `${proto}://${host}`.replace(/\/+$/, '');
};

const buildProtectedResourceMetadata = (req) => {
  const base = getPublicBaseUrl(req);
  return {
    resource: base,
    authorization_servers: [base],
    scopes_supported: [MCP_SCOPE],
  };
};

const buildAuthorizationServerMetadata = (req) => {
  const base = getPublicBaseUrl(req);
  return {
    issuer: base,
    authorization_endpoint: AUTHORIZATION_ENDPOINT,
    token_endpoint: TOKEN_ENDPOINT,
    registration_endpoint: `${base}/register`,
    jwks_uri: JWKS_URI,
    code_challenge_methods_supported: ['S256'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [MCP_SCOPE],
  };
};

app.get('/health', (_req, res) => res.json({ ok: true }));

// Protected Resource Metadata (MCP requirement)
app.get('/.well-known/oauth-protected-resource', (req, res) => {
  res.json(buildProtectedResourceMetadata(req));
});

// Authorization Server Metadata (RFC8414-style)
app.get('/.well-known/oauth-authorization-server', (req, res) => {
  res.json(buildAuthorizationServerMetadata(req));
});

// OIDC discovery (some clients prefer this endpoint)
app.get('/.well-known/openid-configuration', (req, res) => {
  res.json(buildAuthorizationServerMetadata(req));
});

// Dynamic Client Registration shim (Entra ID does not support RFC7591 DCR)
// We return a pre-created Entra client id (ChatGPT-MCP-Client) as a stable client.
app.post('/register', (req, res) => {
  if (!CHATGPT_CLIENT_ID) {
    res.status(500).json({
      error: 'server_error',
      error_description: 'CHATGPT_CLIENT_ID is not configured on the server',
    });
    return;
  }

  res.status(201).json({
    client_id: CHATGPT_CLIENT_ID,
    token_endpoint_auth_method: 'none',
    redirect_uris: CHATGPT_REDIRECT_URIS,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
  });
});

// Require auth for MCP calls (ChatGPT expects 401 + WWW-Authenticate challenge)
app.use('/mcp', (req, res, next) => {
  if (!REQUIRE_MCP_AUTH) return next();
  if (req.method === 'OPTIONS') return next();

  const auth = (req.headers.authorization || '').toString();
  if (auth.startsWith('Bearer ')) return next();

  const base = getPublicBaseUrl(req);
  res.set(
    'WWW-Authenticate',
    `Bearer realm="mcp", resource_metadata="${base}/.well-known/oauth-protected-resource"`
  );
  res.status(401).json({ error: 'unauthorized' });
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
