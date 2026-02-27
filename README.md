# MCP Dataverse Server (Node + Express)

This server exposes Dataverse operations as MCP tools for ChatGPT/Copilot style clients.
Legacy `/api/cats` REST routes are still present in this repo, but MCP tools are now Dataverse-first.

## 1) Setup

```bash
npm i
cp .env.example .env
npm start
```

## 2) Env

- `PORT` (default 3000)
- `PUBLIC_BASE_URL` (recommended for hosted MCP) — used in OAuth metadata
- `AZURE_TENANT_ID` (required)
- `MCP_SERVICE_APP_ID` (required) — Entra app id for your MCP service API
- `MCP_SERVICE_APP_CLIENT_SECRET` (required) — secret value for MCP service app
- `DATAVERSE_URL` (required) — e.g. `https://org.crm.dynamics.com`
- `DATAVERSE_SCOPE` (optional) — default `${DATAVERSE_URL}/user_impersonation`
- `DATAVERSE_API_VERSION` (optional, default `v9.2`)
- `MCP_API_KEY` (optional) — if set, require `x-api-key` on REST + MCP
- `MCP_REQUIRE_AUTH` (`1` in production by default)
- `MCP_STATELESS` (`1` on Vercel by default) — avoids in-memory session coupling
- `ENABLE_CATS_API` (`0` default) — only needed if you still want legacy `/api/cats`
- `REQUIRE_DB_ON_STARTUP` (`0` default) — if `1`, process exits when DB is unavailable
- `OAUTH_DEBUG` (`0` default) — logs token proxy request/response snippets
- `CORS_ALLOWED_ORIGINS` (default `*`) — comma list, set to `*` to allow all
- `CORS_ALLOW_CREDENTIALS` (`0` by default)
- `ALLOWED_ORIGINS` (optional) — extra `/mcp` origin allowlist for non-Bearer callers
- `ALLOWED_HOSTS` (optional) — host header allowlist for DNS rebinding protection

## 3) REST endpoints

- `GET    /api/cats`
- `GET    /api/cats/:id`
- `POST   /api/cats`
- `PUT    /api/cats/:id`
- `DELETE /api/cats/:id`

## 4) MCP Endpoint

- `POST /mcp` (Streamable HTTP, JSON response mode)

Tools exposed:

- `dataverse_whoami`
- `dataverse_list_rows`
- `dataverse_get_row`
- `dataverse_create_row`
- `dataverse_update_row`
- `dataverse_delete_row`

## Notes

- `/mcp` expects `Authorization: Bearer <token>` from ChatGPT OAuth.
- Dataverse calls are executed using Entra OAuth On-Behalf-Of (OBO) with the incoming bearer token.
- Uses MCP Streamable HTTP in JSON response mode (`enableJsonResponse: true`).
