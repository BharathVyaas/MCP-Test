import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

import { requireApiKey, requireAllowedOrigin } from '../auth.js';
import { buildMcpServer } from './server.js';

function getBearerToken(req) {
  const auth = (req.headers.authorization || '').toString();
  if (!auth.startsWith('Bearer ')) return '';
  return auth.slice('Bearer '.length).trim();
}

export function mountMcp(app) {
  const useStatelessMode =
    (process.env.MCP_STATELESS || (process.env.VERCEL ? '1' : '0')) === '1';
  const transports = new Map();
  const sessionTokens = new Map();

  app.post('/mcp', requireApiKey, requireAllowedOrigin, async (req, res) => {
    try {
      if (useStatelessMode) {
        const inboundToken = getBearerToken(req);
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        });
        const server = buildMcpServer({
          getInboundAccessToken: () => inboundToken,
        });
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        res.on('close', () => {
          transport.close();
          server.close();
        });
        return;
      }

      const sessionId = req.headers['mcp-session-id'];
      let transport = sessionId ? transports.get(String(sessionId)) : undefined;

      if (!transport && !sessionId && isInitializeRequest(req.body)) {
        let initializedSessionId = '';
        const initialInboundToken = getBearerToken(req);

        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          enableJsonResponse: true,
          onsessioninitialized: (sid) => {
            initializedSessionId = sid;
            transports.set(sid, transport);
            if (initialInboundToken) {
              sessionTokens.set(sid, initialInboundToken);
            }
          },
        });

        const server = buildMcpServer({
          getInboundAccessToken: () =>
            (initializedSessionId ? sessionTokens.get(initializedSessionId) : undefined) || initialInboundToken,
        });
        await server.connect(transport);

        await transport.handleRequest(req, res, req.body);
        return;
      }

      if (!transport) {
        res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
          id: null,
        });
        return;
      }

      const incomingToken = getBearerToken(req);
      if (incomingToken) {
        sessionTokens.set(String(sessionId), incomingToken);
      }

      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error('MCP error:', err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  });

  app.get('/mcp', requireApiKey, requireAllowedOrigin, (_req, res) => {
    res.status(405).set('Allow', 'POST').send('Method Not Allowed');
  });

  app.delete('/mcp', requireApiKey, requireAllowedOrigin, (_req, res) => {
    res.status(405).set('Allow', 'POST').send('Method Not Allowed');
  });
}
