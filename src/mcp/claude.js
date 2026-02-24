#!/usr/bin/env node

import process from "node:process";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildMcpServer } from "./server.js";

async function main() {
  try {
    console.error("Starting MCP Claude server...");

    const transport = new StdioServerTransport();
    const server = buildMcpServer();

    await server.connect(transport);

    console.error("MCP Claude server connected");
  } catch (err) {
    console.error("Fatal MCP error:", err);
    process.exit(1);
  }
}

main();