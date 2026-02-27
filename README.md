# MCP Cats Server (Node + Express + MongoDB)

A tiny, readable example that exposes the same "Cats" CRUD two ways:

1) REST API (for normal apps)
2) MCP tools (for AI clients like ChatGPT / Claude / Copilot)

## 1) Setup

```bash
npm i
cp .env.example .env
npm start
```

## 2) Env

- `MONGODB_URI` (required)
- `PORT` (default 3000)
- `PUBLIC_BASE_URL` (recommended for hosted MCP) — used in OAuth metadata
- `MCP_API_KEY` (optional) — if set, require `x-api-key` on REST + MCP
- `MCP_REQUIRE_AUTH` (`1` in production by default)
- `MCP_STATELESS` (`1` on Vercel by default) — avoids in-memory session coupling
- `REQUIRE_DB_ON_STARTUP` (`0` default) — if `1`, process exits when DB is unavailable
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

## 4) MCP endpoint

- `POST /mcp` (Streamable HTTP, JSON response mode)

Tools exposed:

- `cats_list`
- `cats_get`
- `cats_add`
- `cats_update`
- `cats_delete`

## Notes

- Uses MCP Streamable HTTP in **JSON response mode** (`enableJsonResponse: true`), so we don't need SSE/GET.
- Uses `createMcpExpressApp()` for sane defaults (DNS rebinding protection, JSON parsing). See MCP docs/spec.
