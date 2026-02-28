# Dataverse MCP Integration Specification

This document describes only the ChatGPT <-> OAuth <-> MCP <-> Dataverse integration design implemented in this repository.
It intentionally focuses on identity, protocol, tools, permissions, and API flow.

## 1) Integration Actors

1. ChatGPT connector runtime
2. This MCP server (`/mcp`, OAuth metadata, OAuth proxy endpoints)
3. Microsoft Entra app: `ChatGPT-MCP-Client` (public client / SPA for PKCE)
4. Microsoft Entra app: `MCP-Dataverse-Service` (confidential service app for OBO)
5. Dataverse Web API (`https://<org>.crm*.dynamics.com/api/data/v9.2`)

Role split between Entra apps:
- `ChatGPT-MCP-Client` is used by ChatGPT during Authorization Code + PKCE login/consent.
- `MCP-Dataverse-Service` is used by this server to perform OBO and call Dataverse on behalf of the signed-in user.

## 2) End-to-End Flow

```text
ChatGPT -> MCP /.well-known/*                (discover OAuth + MCP metadata)
ChatGPT -> MCP /register                     (DCR shim -> fixed client_id)
ChatGPT -> MCP /oauth/authorize              (proxy to Entra authorize endpoint)
Entra   -> ChatGPT redirect_uri?code=...     (user login + consent complete)
ChatGPT -> MCP /oauth/token                  (proxy token redemption to Entra)
ChatGPT -> MCP /mcp (Bearer access token)    (MCP initialize + tool calls)
MCP     -> Entra /token (OBO)                (assertion=inbound token)
MCP     -> Dataverse Web API                 (tool-specific operation)
MCP     -> ChatGPT                            (JSON-RPC tool result)
```

## 3) OAuth and Registration Surface

### `GET /.well-known/oauth-protected-resource`
Returns MCP protected resource metadata:
- `resource`
- `authorization_servers`
- `scopes_supported` (includes `MCP_SCOPE`, `offline_access`)

### `GET /.well-known/oauth-protected-resource/mcp`
Resource-specific alias returning the same metadata shape for `/mcp`.

### `GET /.well-known/oauth-authorization-server`
### `GET /.well-known/openid-configuration`
Returns authorization server metadata used by ChatGPT:
- `issuer`
- `authorization_endpoint` -> `/oauth/authorize`
- `token_endpoint` -> `/oauth/token`
- `registration_endpoint` -> `/register`
- `jwks_uri` -> Entra keys endpoint
- grant/response methods and scopes

### `GET /oauth/authorize`
Proxy to Entra authorize endpoint:
- Copies incoming query params
- Removes `resource` parameter (Entra v2 incompatibility)
- Responds with redirect to Entra authorize URL

### `POST /oauth/token`
Proxy to Entra token endpoint:
- Accepts `application/x-www-form-urlencoded`
- Removes incoming `resource`
- Forwards form body to Entra token endpoint
- Forwards Entra status/body/content-type back to caller

### `GET|POST /register`
Dynamic Client Registration shim:
- Entra does not support RFC7591 DCR for this use case
- Server returns pre-configured client record for ChatGPT
- Uses `CHATGPT_CLIENT_ID`, optional `CHATGPT_CLIENT_SECRET`

## 4) MCP Endpoint Behavior

### `POST /mcp`
MCP Streamable HTTP endpoint using JSON response mode.

Authentication gate:
- If `MCP_REQUIRE_AUTH=1`, request must include `Authorization: Bearer <token>`
- On missing token, server returns `401` with `WWW-Authenticate` challenge containing `resource_metadata`

Session model:
- Stateless mode when `MCP_STATELESS=1` (or `VERCEL` set)
- Stateful mode otherwise with `mcp-session-id` transport map
- Inbound Bearer token is captured and passed into tool execution for OBO

### `GET /mcp` and `DELETE /mcp`
Always `405 Method Not Allowed`.

## 5) Dataverse Tool Model (What GPT Can Do)

Tools are explicitly declared in `src/mcp/server.js` via `server.registerTool(...)`.
Only these tools are exposed to GPT:

### Basic Operations
1. `dataverse_whoami`
- Dataverse call: `GET WhoAmI()`
- Purpose: validate token and identity context

2. `dataverse_list_tables`
- Dataverse call: `GET EntityDefinitions?$select=...`
- Applies `customOnly`, `logicalNameContains`, `top` filtering in server code

3. `dataverse_create_table`
- Dataverse call: `POST EntityDefinitions`
- Optional publish step: `POST PublishAllXml`

4. `dataverse_list_rows`
- Dataverse call: `GET /<entitySet>?$select&$filter&$orderby&$expand&$top&$count`

5. `dataverse_get_row`
- Dataverse call: `GET /<entitySet>(<guid>)`

6. `dataverse_create_row`
- Dataverse call: `POST /<entitySet>`

7. `dataverse_update_row`
- Dataverse call: `PATCH /<entitySet>(<guid>)`

8. `dataverse_delete_row`
- Dataverse call: `DELETE /<entitySet>(<guid>)`

### Advanced Operations
9. `dataverse_fetch_xml`
- Dataverse call: `GET /<entitySet>?fetchXml=...`
- Purpose: Execute complex aggregations and multi-table joins.

10. `dataverse_execute_action`
- Dataverse call: `POST /<actionName>`
- Purpose: Trigger unbound Dataverse Actions or Custom APIs.

11. `dataverse_list_relationships`
- Dataverse call: `GET /EntityDefinitions(LogicalName='...')?$expand=ManyToManyRelationships...`
- Purpose: Help the LLM discover how parent and child tables are linked.

12. `dataverse_global_search`
- Dataverse call: `POST /search`
- Purpose: Execute global text search across indexed tables.

13. `dataverse_create_mda` (Experimental)
- Dataverse call: Multiple calls to `appmodules` and `AddAppComponents`
- Purpose: Generates a new Model-Driven App surface containing the requested tables.

## 6) Tool Response Contract

All tools return MCP-compatible response objects with both text and structured payload.

Success shape:
```json
{
  "content": [{ "type": "text", "text": "{ ...pretty JSON... }" }],
  "structuredContent": { "...": "..." }
}
```

Error shape:
```json
{
  "isError": true,
  "content": [{ "type": "text", "text": "Error message" }]
}
```

Dataverse call wrapper returns:
- `status`: HTTP status from Dataverse
- `data`: parsed JSON (or text fallback)
- `etag`: response `etag` header when present
- `entityId`: response `odata-entityid` header when present

## 7) OBO (On-Behalf-Of) Token Exchange

Each tool execution performs OBO with inbound ChatGPT bearer token:
- Endpoint: `https://login.microsoftonline.com/<tenant>/oauth2/v2.0/token`
- Grant: `urn:ietf:params:oauth:grant-type:jwt-bearer`
- `requested_token_use=on_behalf_of`
- `assertion=<inbound bearer token>`
- `scope=<DATAVERSE_SCOPE>`

This produces a Dataverse access token used for Dataverse Web API calls.

## 8) Environment Variables and Where They Are Used

### Integration `.env` contract (what should be present)
```env
PUBLIC_BASE_URL=https://your-mcp-domain.example.com
AZURE_TENANT_ID=<tenant-guid>
CHATGPT_CLIENT_ID=<chatgpt-mcp-client-app-id>
MCP_SERVICE_APP_ID=<mcp-dataverse-service-app-id>
MCP_SERVICE_APP_CLIENT_SECRET=<service-app-secret-value>
MCP_SCOPE=api://<mcp-dataverse-service-app-id>/mcp.access
DATAVERSE_URL=https://<org>.crm8.dynamics.com
DATAVERSE_SCOPE=https://<org>.crm8.dynamics.com/user_impersonation
DATAVERSE_API_VERSION=v9.2
MCP_REQUIRE_AUTH=1
MCP_STATELESS=1
```

Secret notes:
- `MCP_SERVICE_APP_CLIENT_SECRET` must be the secret **Value**, not secret ID.
- Secret fallback order in code is:
  - `MCP_SERVICE_APP_CLIENT_SECRET`
  - `MCP_SERVICE_CLIENT_SECRET`
  - `AZURE_CLIENT_SECRET`

### Core OAuth/MCP (`src/index.js`)
- `PUBLIC_BASE_URL`: canonical base used in metadata endpoints and challenges
- `AZURE_TENANT_ID`: builds Entra authorize/token/JWKS endpoints
- `MCP_SERVICE_APP_ID`: default source for `MCP_SCOPE`
- `MCP_SCOPE`: exposed scope in OAuth metadata and resource metadata
- `CHATGPT_CLIENT_ID`: returned by `/register`
- `CHATGPT_CLIENT_SECRET`: optional; changes DCR auth method to `client_secret_post`
- `CHATGPT_REDIRECT_URIS`: returned by `/register`
- `MCP_REQUIRE_AUTH`: enforces bearer requirement on `/mcp`
- `OAUTH_DEBUG`: logs `/oauth/token` request/response details
- `OAUTH_TOKEN_ORIGIN`: overrides default forwarded `Origin` to Entra token endpoint

### Dataverse/OBO (`src/mcp/server.js`)
- `AZURE_TENANT_ID`: OBO token endpoint tenant
- `MCP_SERVICE_APP_ID`: OBO `client_id`
- `MCP_SERVICE_APP_CLIENT_SECRET`: OBO `client_secret` (primary)
- `MCP_SERVICE_CLIENT_SECRET`: fallback secret variable
- `AZURE_CLIENT_SECRET`: fallback secret variable
- `DATAVERSE_URL`: base Dataverse URL
- `DATAVERSE_SCOPE`: target OBO scope; default `<DATAVERSE_URL>/user_impersonation`
- `DATAVERSE_API_VERSION`: defaults to `v9.2`
- `DATAVERSE_DEBUG`: logs Dataverse request success details

### Transport/Security (`src/index.js`, `src/auth.js`, `src/mcp/mountMcp.js`)
- `MCP_STATELESS`: stateless transport mode toggle
- `VERCEL`: auto-enables stateless mode when present
- `MCP_API_KEY`: optional x-api-key check for non-bearer callers
- `ALLOWED_ORIGINS`: optional Origin allowlist for `/mcp` (non-bearer)
- `CORS_ALLOWED_ORIGINS`: CORS response policy
- `CORS_ALLOW_CREDENTIALS`: CORS credentials behavior
- `ALLOWED_HOSTS`: host header allowlist
- `RENDER_EXTERNAL_HOSTNAME`: optional host allowlist input
- `BIND_PUBLIC`: force public bind mode

### Legacy flags (not part of Dataverse integration)
- `ENABLE_CATS_API`
- `REQUIRE_DB_ON_STARTUP`

## 9) How GPT Permissions Are Declared

Permissions available to GPT are constrained by two layers:

1. OAuth scope layer
- Exposed via `.well-known` metadata (`MCP_SCOPE`)
- Access token minted by Entra for this scope

2. Tool exposure layer
- Only tools registered in `buildMcpServer()` are callable
- There is no generic arbitrary Dataverse passthrough tool
- Zod input schemas define accepted parameters and shape

Practical effect:
- GPT can only execute explicitly registered capabilities
- GPT cannot access endpoints or operations not represented as a tool

## 10) Request Validation and Security Controls

1. Host header validation
- `createMcpExpressApp(...)` with `allowedHosts` when configured

2. CORS policy
- Applied globally before route handlers
- Supports preflight (`OPTIONS` -> `204`)

3. MCP auth challenge
- On missing bearer, server returns `WWW-Authenticate` with `resource_metadata` URL

4. Optional x-api-key fallback
- Enforced only for non-bearer callers when `MCP_API_KEY` is set

5. Metadata endpoint hardening
- `/oauth/authorize` strips `resource` parameter
- `/oauth/token` strips `resource` and forwards form body safely

## 11) Error Source Guide

1. `Missing required environment variables: ...`
- Emitted by Dataverse config guard before OBO call

2. `Dataverse OBO token exchange failed (...)`
- Service app credential/scope/tenant misconfiguration

3. `Dataverse API failed (400/401/403/...)`
- Dataverse request/permission/schema error

4. `Bad Request: No valid session ID provided`
- Stateful mode follow-up call missing `mcp-session-id`

5. `unauthorized` on `/mcp`
- `MCP_REQUIRE_AUTH=1` and bearer token missing

## 12) Legacy Surface

Legacy `/api/cats` endpoints remain in code and are disabled by default.
They are not part of this Dataverse integration contract.
