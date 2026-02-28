# Claude Desktop Setup Guide (Dataverse MCP)

This document contains the exact, step-by-step instructions to connect this Dataverse MCP server to the local **Claude Desktop App**. 

Unlike ChatGPT (which uses an internet-based SSE connection with user login popups), Claude Desktop runs the server locally via standard I/O (`stdio`) and requires backend "Server-to-Server" (S2S) authentication.

---

## Step 1: Configure the Local Environment

The local machine running Claude Desktop MUST have a `.env` file at the root of the `mcp-cats-server` repository. 

Create a `.env` file with the following exact keys:

```ini
# The Azure Active Directory Tenant ID
AZURE_TENANT_ID=your-tenant-id-here

# The Microsoft Entra ID App Registration Client ID
MCP_SERVICE_APP_ID=your-client-id-here

# The Secret for the App Registration
MCP_SERVICE_APP_CLIENT_SECRET=your-client-secret-here

# The exact URL of the target Dataverse Environment (no trailing slash)
DATAVERSE_URL=https://yourorg.crm.dynamics.com
```

## Step 2: Configure Dataverse for S2S Authentication

Claude Desktop authenticates silently as a "Robot" (Service Principal / Client Credentials flow). It does not use your personal Microsoft login. 

**You MUST grant this robot permission inside Dataverse, or you will get a `401 Unauthorized` error.**

1. Go to the [Power Platform Admin Center](https://admin.powerplatform.microsoft.com/).
2. Navigate to **Environments** -> Click your target environment.
3. Under the "Access" box, click **S2S Apps** (or Settings > Users + permissions > Application users).
4. Click **New app user**.
5. Click **Add an app** and paste your `MCP_SERVICE_APP_ID` (Client ID). Select it.
6. Select your root **Business Unit**.
7. Under **Security roles**, assign it **System Administrator** (or the exact minimum roles required to read/write the tables you need).
8. Click **Create / Save**.

## Step 3: Configure `claude.js`

Ensure `src/mcp/claude.js` is properly configured. 

1. **Authentication Mode**: It must be explicitly set to `client_credentials` so the MCP server knows not to expect a Bearer token from a human user.
2. **Environment Loading**: It must explicitly load `.env` using `dotenv`, otherwise the Dataverse variables will be `undefined`.

*This repo's `src/mcp/claude.js` is already pre-configured to handle both of these requirements perfectly.*

## Step 4: Add the Server to Claude Desktop

You must tell the Claude Desktop App where your local server is and explicitly instruct Node.js to load your `.env` file BEFORE evaluating any ES6 imports.

1. Open the Claude Desktop configuration file:
   - **Mac**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

2. Add the `dataverse` MCP server exact configuration:

```json
{
  "mcpServers": {
    "dataverse": {
      "command": "node",
      "args": [
        "--env-file=/ABSOLUTE/PATH/TO/mcp-cats-server/.env",
        "/ABSOLUTE/PATH/TO/mcp-cats-server/src/mcp/claude.js"
      ]
    }
  }
}
```

*CRITICAL*: Replace `/ABSOLUTE/PATH/TO/...` with the exact, full absolute path to your repository on your hard drive. 

## Step 5: Restart and Test

1. **Fully Quit** the Claude Desktop App (from the Mac menu bar or Windows system tray).
2. Reopen Claude Desktop.
3. Look for the 🔌 plug icon at the bottom of the chat window to confirm the `dataverse` tools are connected.
4. Type `List Dataverse tables` to verify the connection is live and the robot is authenticated!
