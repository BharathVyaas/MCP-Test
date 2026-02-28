# Gemini CLI Integration Guide

This document describes how the Gemini CLI (and other standard local MCP runners) connect to this Dataverse MCP Server. 

Unlike ChatGPT, which uses an interactive OAuth login to pass a user token to the server, local CLI tools need a static way to authenticate over the internet to your Vercel deployment. 

## 1. How Gemini CLI Authenticates

We added a **Static API Key Authentication layer** to the server specifically for CLI tools.

*   When ChatGPT connects, it uses the Middle-Tier On-Behalf-Of (OBO) flow using Entra ID.
*   When the Gemini CLI connects, it passes a static password (`GEMINI_API_KEY`) to the server. The server verifies this password, skips the OBO flow entirely, and talks to Dataverse directly as the "Service Principal" (the Entra App itself) using `MCP_SERVICE_APP_CLIENT_SECRET`.

## 2. Setting Up the Server (`GEMINI_API_KEY`)

To allow the Gemini CLI to connect to your deployed Vercel server, you must set an Environment Variable named `GEMINI_API_KEY`.

### Generating the Key
You can generate a secure, random 64-character hex string using OpenSSL in your terminal:

```bash
openssl rand -hex 32
```
*Example Output: `2c999bf1bc9601ab965bf354329f78b626ee30bafcaba6b60fc40d1ee12eb808`*

### Adding it to Vercel
1. Go to your Vercel Dashboard.
2. Select your `mcptest-gamma` project.
3. Navigate to **Settings > Environment Variables**.
4. Add the key: `GEMINI_API_KEY`
5. Add the value: Your generated string (e.g. `2c999bf1bc9601ab...`)
6. Go to the "Deployments" tab and Redeploy your application.

## 3. The Endpoints Built for Gemini CLI

The original codebase ran a custom Streamable HTTP POST at `/mcp` for ChatGPT. We preserved that completely.

For Gemini CLI, we added two standard MCP Server-Sent Events (SSE) endpoints:
*   `GET /mcp/sse`: Initializes the connection and streams responses back to the CLI.
*   `POST /mcp/messages`: The CLI posts its JSON-RPC commands (like "call tool `dataverse_whoami`") here.

*Both of these endpoints are strictly guarded by the `requireGeminiApiKey` middleware in `src/auth.js`.*

## 4. Configuring the Gemini CLI

Once your Vercel server is deployed with the `GEMINI_API_KEY` environment variable, you need to configure your local Gemini CLI (or VS Code MCP extension) to point to it.

Open your Gemini CLI settings file (e.g., `~/.gemini/settings.json`) and configure the `mcpServers` block like this:

```json
{
  "mcpServers": {
    "dataverse-server": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/inspector",
        "https://mcptest-gamma.vercel.app/mcp/sse"
      ],
      "env": {
        "AUTHORIZATION": "Bearer <YOUR_GEMINI_API_KEY>"
      }
    }
  }
}
```

### Explaining the JSON setup:
*   **`"https://.../mcp/sse"`**: This points the MCP runner directly at the new initialization endpoint we built.
*   **`"AUTHORIZATION": "Bearer <YOUR_GEMINI_API_KEY>"`**: This injects your secure key as an HTTP header into every request the CLI makes to your server, ensuring the server lets the traffic through. Do not forget the word `Bearer ` with a space before the key.

## 5. What the Gemini CLI Can Do

Once connected, the Gemini CLI has access to the exact same 13 tools as ChatGPT:
*   CRUD operations (`dataverse_create_row`, `dataverse_get_row`, etc.)
*   Metadata exploration (`dataverse_list_tables`, `dataverse_list_relationships`)
*   Execution operations (`dataverse_execute_action`, `dataverse_fetch_xml`)
*   App creation (`dataverse_create_mda`)
