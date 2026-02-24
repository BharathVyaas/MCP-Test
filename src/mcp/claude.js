#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildMcpServer } from './server.js';

async function main() {
  const transport = new StdioServerTransport();
  const server = buildMcpServer();

  await server.connect(transport);
}

main().catch(err => {
  console.error('MCP Claude server failed:', err);
  process.exit(1);
});