import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

import { requireApiKey, requireAllowedOrigin } from '../auth.js';
import { buildMcpServer } from './server.js';

export function mountMcp(app) {
  const transports = new Map();

  app.post('/mcp', requireApiKey, requireAllowedOrigin, async (req, res) => {
    try {
      const sessionId = req.headers['mcp-session-id'];
      let transport = sessionId ? transports.get(String(sessionId)) : undefined;

      if (!transport && !sessionId && isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          enableJsonResponse: true,
          onsessioninitialized: (sid) => {
            transports.set(sid, transport);
          },
        });

        const server = buildMcpServer();
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
}
