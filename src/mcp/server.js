import * as z from 'zod/v4';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const TENANT_ID = (process.env.AZURE_TENANT_ID || '').trim();
const MCP_SERVICE_APP_ID = (process.env.MCP_SERVICE_APP_ID || '').trim();
const MCP_SERVICE_APP_CLIENT_SECRET = (
  process.env.MCP_SERVICE_APP_CLIENT_SECRET ||
  process.env.MCP_SERVICE_CLIENT_SECRET ||
  process.env.AZURE_CLIENT_SECRET ||
  ''
).trim();

const DATAVERSE_URL = (process.env.DATAVERSE_URL || '').trim().replace(/\/+$/, '');
const DATAVERSE_API_VERSION = (process.env.DATAVERSE_API_VERSION || 'v9.2').trim();
const DATAVERSE_SCOPE = (
  process.env.DATAVERSE_SCOPE ||
  (DATAVERSE_URL ? `${DATAVERSE_URL}/user_impersonation` : '')
).trim();
const DATAVERSE_DEBUG = (process.env.DATAVERSE_DEBUG || '0') === '1';

const OBO_TOKEN_ENDPOINT = TENANT_ID
  ? `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`
  : '';
const DATAVERSE_API_BASE = DATAVERSE_URL
  ? `${DATAVERSE_URL}/api/data/${DATAVERSE_API_VERSION}`
  : '';

const toJsonResponse = (payload) => ({
  content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
  structuredContent: payload,
});

const toErrorResponse = (message) => ({
  isError: true,
  content: [{ type: 'text', text: message }],
});

const ensureDataverseConfig = () => {
  const missing = [];
  if (!TENANT_ID) missing.push('AZURE_TENANT_ID');
  if (!MCP_SERVICE_APP_ID) missing.push('MCP_SERVICE_APP_ID');
  if (!MCP_SERVICE_APP_CLIENT_SECRET) missing.push('MCP_SERVICE_APP_CLIENT_SECRET');
  if (!DATAVERSE_URL) missing.push('DATAVERSE_URL');
  if (!DATAVERSE_SCOPE) missing.push('DATAVERSE_SCOPE');
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
};

const toErrorText = (status, payload) => {
  if (!payload) return `status=${status}`;
  if (typeof payload === 'string') return payload;
  return payload.error_description || payload.error?.message || payload.error || `status=${status}`;
};

const parseMaybeJson = (text) => {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_err) {
    return text;
  }
};

const normalizeTable = (table) => {
  const cleaned = String(table || '').trim().replace(/^\/+/, '').replace(/\/+$/, '');
  if (!cleaned) throw new Error('table is required');
  return cleaned;
};

const normalizeRowId = (id) => {
  const cleaned = String(id || '').trim().replace(/^\{/, '').replace(/\}$/, '');
  if (!cleaned) throw new Error('id is required');
  return cleaned;
};

const normalizeLogicalName = (name) => {
  const cleaned = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+/, '')
    .replace(/_+$/, '');
  if (!cleaned) throw new Error('logicalName is required');
  if (!cleaned.includes('_')) {
    throw new Error('logicalName must include a publisher prefix, e.g. cr0f1_project');
  }
  return cleaned;
};

const toSchemaName = (logicalName) => {
  const parts = logicalName.split('_').filter(Boolean);
  if (parts.length === 0) return logicalName;
  const [prefix, ...rest] = parts;
  const tail = rest.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
  return tail ? `${prefix}_${tail}` : prefix;
};

async function exchangeTokenOnBehalfOf(inboundAccessToken) {
  ensureDataverseConfig();
  if (!inboundAccessToken) {
    throw new Error('Missing incoming Bearer token. ChatGPT must call /mcp with Authorization: Bearer <token>.');
  }

  const params = new URLSearchParams({
    client_id: MCP_SERVICE_APP_ID,
    client_secret: MCP_SERVICE_APP_CLIENT_SECRET,
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    requested_token_use: 'on_behalf_of',
    assertion: inboundAccessToken,
    scope: DATAVERSE_SCOPE,
  });

  const response = await fetch(OBO_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: params.toString(),
  });

  const text = await response.text();
  const payload = parseMaybeJson(text);
  if (!response.ok || !payload?.access_token) {
    throw new Error(`Dataverse OBO token exchange failed (${response.status}): ${toErrorText(response.status, payload)}`);
  }

  return payload.access_token;
}

async function getClientCredentialsToken() {
  ensureDataverseConfig();

  const params = new URLSearchParams({
    client_id: MCP_SERVICE_APP_ID,
    client_secret: MCP_SERVICE_APP_CLIENT_SECRET,
    grant_type: 'client_credentials',
    scope: DATAVERSE_URL ? `${DATAVERSE_URL}/.default` : '',
  });

  const response = await fetch(OBO_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: params.toString(),
  });

  const text = await response.text();
  const payload = parseMaybeJson(text);
  if (!response.ok || !payload?.access_token) {
    throw new Error(`Dataverse client_credentials token exchange failed (${response.status}): ${toErrorText(response.status, payload)}`);
  }

  return payload.access_token;
}

async function callDataverse(accessToken, { method = 'GET', path, query, headers, body }) {
  ensureDataverseConfig();

  const normalizedPath = String(path || '').replace(/^\/+/, '');
  const isMetadataPath = /^(EntityDefinitions|RelationshipDefinitions|GlobalOptionSetDefinitions)\b/i
    .test(normalizedPath);
  const url = new URL(normalizedPath, `${DATAVERSE_API_BASE}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }

  const requestHeaders = {
    'Authorization': `Bearer ${accessToken}`,
    'Accept': 'application/json',
    'OData-Version': '4.0',
    'OData-MaxVersion': '4.0',
    ...(isMetadataPath ? { 'ConsistencyLevel': 'eventual' } : {}),
    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(headers || {}),
  };

  const response = await fetch(url, {
    method,
    headers: requestHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  const payload = parseMaybeJson(text);
  if (!response.ok) {
    throw new Error(`Dataverse API failed (${response.status}): ${toErrorText(response.status, payload)}`);
  }

  if (DATAVERSE_DEBUG) {
    console.log('dataverse request ok', { method, url: url.toString(), status: response.status });
  }

  return {
    status: response.status,
    data: payload,
    etag: response.headers.get('etag') || undefined,
    entityId: response.headers.get('odata-entityid') || undefined,
  };
}

const runWithDataverseToken = async (getInboundAccessToken, authMode, fn) => {
  try {
    let dataverseAccessToken;
    if (authMode === 'client_credentials') {
      dataverseAccessToken = await getClientCredentialsToken();
    } else {
      const inboundAccessToken = await Promise.resolve(getInboundAccessToken?.());
      dataverseAccessToken = await exchangeTokenOnBehalfOf(inboundAccessToken);
    }
    const output = await fn(dataverseAccessToken);
    return toJsonResponse(output);
  } catch (err) {
    return toErrorResponse(err?.message || 'Unexpected Dataverse error');
  }
};

export function buildMcpServer({ getInboundAccessToken, authMode = 'obo' } = {}) {
  const server = new McpServer(
    { name: 'mcp-dataverse', version: '0.2.0' },
    { capabilities: { logging: {} } }
  );

  server.registerTool(
    'dataverse_whoami',
    {
      title: 'Dataverse WhoAmI',
      description: 'Validate Dataverse connectivity and return user identifiers.',
      inputSchema: {},
    },
    async () => runWithDataverseToken(getInboundAccessToken, authMode, async (token) => {
      const result = await callDataverse(token, { method: 'GET', path: 'WhoAmI()' });
      return result;
    })
  );

  server.registerTool(
    'dataverse_list_tables',
    {
      title: 'List Dataverse Tables',
      description: 'List Dataverse table metadata (entity definitions).',
      inputSchema: {
        top: z.number().int().min(1).max(500).optional().default(100),
        customOnly: z.boolean().optional().default(false),
        logicalNameContains: z.string().optional().describe('Filter by logical name substring'),
      },
    },
    async ({ top = 100, customOnly = false, logicalNameContains }) =>
      runWithDataverseToken(getInboundAccessToken, authMode, async (token) => {
        const result = await callDataverse(token, {
          method: 'GET',
          path: 'EntityDefinitions',
          query: {
            $select: [
              'LogicalName',
              'SchemaName',
              'EntitySetName',
              'PrimaryIdAttribute',
              'PrimaryNameAttribute',
              'IsCustomEntity',
            ].join(','),
          },
        });

        if (!result?.data?.value || !Array.isArray(result.data.value)) {
          return result;
        }

        let filtered = result.data.value;

        if (customOnly) {
          filtered = filtered.filter((row) => row?.IsCustomEntity === true);
        }

        if (logicalNameContains) {
          const needle = String(logicalNameContains).toLowerCase();
          filtered = filtered.filter((row) => {
            const logical = String(row?.LogicalName || '').toLowerCase();
            const schema = String(row?.SchemaName || '').toLowerCase();
            const entitySet = String(row?.EntitySetName || '').toLowerCase();
            return logical.includes(needle) || schema.includes(needle) || entitySet.includes(needle);
          });
        }

        const limited = Number.isFinite(top) && top > 0 ? filtered.slice(0, top) : filtered;

        return {
          ...result,
          data: {
            ...result.data,
            value: limited,
          },
        };
      })
  );

  server.registerTool(
    'dataverse_list_rows',
    {
      title: 'List Dataverse Rows',
      description: 'List rows from a Dataverse table (entity set name).',
      inputSchema: {
        table: z.string().describe('Dataverse entity set name, e.g. accounts or contacts'),
        select: z.array(z.string()).optional().describe('Columns to return'),
        filter: z.string().optional().describe("OData $filter expression"),
        orderBy: z.string().optional().describe("OData $orderby expression"),
        top: z.number().int().min(1).max(500).optional().default(25),
        expand: z.string().optional().describe("OData $expand expression"),
        count: z.boolean().optional().default(false),
      },
    },
    async ({ table, select, filter, orderBy, top = 25, expand, count = false }) =>
      runWithDataverseToken(getInboundAccessToken, authMode, async (token) => {
        const entitySet = normalizeTable(table);
        const query = {
          $top: top,
          ...(select?.length ? { $select: select.join(',') } : {}),
          ...(filter ? { $filter: filter } : {}),
          ...(orderBy ? { $orderby: orderBy } : {}),
          ...(expand ? { $expand: expand } : {}),
          ...(count ? { $count: 'true' } : {}),
        };
        return callDataverse(token, { method: 'GET', path: entitySet, query });
      })
  );

  server.registerTool(
    'dataverse_create_table',
    {
      title: 'Create Dataverse Table',
      description: 'Create a custom Dataverse table (EntityDefinition).',
      inputSchema: {
        logicalName: z.string().describe('Custom logical name with prefix, e.g. cr0f1_project'),
        displayName: z.string().describe('Display name, e.g. Project'),
        displayCollectionName: z.string().optional().describe('Plural display name, e.g. Projects'),
        primaryNameLogicalName: z.string().optional().describe('Primary name attribute logical name'),
        primaryNameDisplayName: z.string().optional().describe('Primary name label, default Name'),
        ownershipType: z.enum(['UserOwned', 'OrganizationOwned']).optional().default('UserOwned'),
        description: z.string().optional(),
        primaryNameMaxLength: z.number().int().min(10).max(4000).optional().default(200),
        publishAfterCreate: z.boolean().optional().default(true),
      },
    },
    async ({
      logicalName,
      displayName,
      displayCollectionName,
      primaryNameLogicalName,
      primaryNameDisplayName = 'Name',
      ownershipType = 'UserOwned',
      description = '',
      primaryNameMaxLength = 200,
      publishAfterCreate = true,
    }) =>
      runWithDataverseToken(getInboundAccessToken, authMode, async (token) => {
        const normalizedLogicalName = normalizeLogicalName(logicalName);
        const schemaName = toSchemaName(normalizedLogicalName);
        const primaryAttributeLogicalName =
          String(primaryNameLogicalName || `${normalizedLogicalName}name`)
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, '_');

        const label = String(displayName || '').trim();
        if (!label) throw new Error('displayName is required');
        const pluralLabel = String(displayCollectionName || `${label}s`).trim();

        const body = {
          '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
          LogicalName: normalizedLogicalName,
          SchemaName: schemaName,
          DisplayName: {
            LocalizedLabels: [{ Label: label, LanguageCode: 1033 }],
          },
          DisplayCollectionName: {
            LocalizedLabels: [{ Label: pluralLabel, LanguageCode: 1033 }],
          },
          Description: {
            LocalizedLabels: [{ Label: description || `${label} table`, LanguageCode: 1033 }],
          },
          OwnershipType: ownershipType,
          IsActivity: false,
          HasActivities: false,
          HasNotes: true,
          PrimaryNameAttribute: primaryAttributeLogicalName,
          Attributes: [
            {
              '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
              LogicalName: primaryAttributeLogicalName,
              SchemaName: toSchemaName(primaryAttributeLogicalName),
              DisplayName: {
                LocalizedLabels: [{ Label: primaryNameDisplayName, LanguageCode: 1033 }],
              },
              RequiredLevel: {
                Value: 'ApplicationRequired',
              },
              MaxLength: primaryNameMaxLength,
            },
          ],
        };

        const created = await callDataverse(token, {
          method: 'POST',
          path: 'EntityDefinitions',
          body,
        });

        if (publishAfterCreate) {
          try {
            await callDataverse(token, {
              method: 'POST',
              path: 'PublishAllXml',
              body: {},
            });
          } catch (publishErr) {
            return {
              ...created,
              publish: {
                ok: false,
                error: publishErr?.message || 'PublishAllXml failed',
              },
            };
          }
        }

        return {
          ...created,
          publish: publishAfterCreate ? { ok: true } : { ok: false, skipped: true },
        };
      })
  );

  server.registerTool(
    'dataverse_get_row',
    {
      title: 'Get Dataverse Row',
      description: 'Get one Dataverse row by GUID.',
      inputSchema: {
        table: z.string().describe('Dataverse entity set name'),
        id: z.string().describe('Dataverse row GUID (with or without braces)'),
        select: z.array(z.string()).optional(),
        expand: z.string().optional(),
      },
    },
    async ({ table, id, select, expand }) =>
      runWithDataverseToken(getInboundAccessToken, authMode, async (token) => {
        const entitySet = normalizeTable(table);
        const rowId = normalizeRowId(id);
        const query = {
          ...(select?.length ? { $select: select.join(',') } : {}),
          ...(expand ? { $expand: expand } : {}),
        };
        return callDataverse(token, {
          method: 'GET',
          path: `${entitySet}(${encodeURIComponent(rowId)})`,
          query,
        });
      })
  );

  server.registerTool(
    'dataverse_create_row',
    {
      title: 'Create Dataverse Row',
      description: 'Create a Dataverse row in the specified table.',
      inputSchema: {
        table: z.string().describe('Dataverse entity set name'),
        data: z.record(z.string(), z.unknown()).describe('JSON payload for the new row'),
        returnRepresentation: z.boolean().optional().default(true),
      },
    },
    async ({ table, data, returnRepresentation = true }) =>
      runWithDataverseToken(getInboundAccessToken, authMode, async (token) => {
        const entitySet = normalizeTable(table);
        const headers = returnRepresentation ? { Prefer: 'return=representation' } : undefined;
        return callDataverse(token, {
          method: 'POST',
          path: entitySet,
          headers,
          body: data,
        });
      })
  );

  server.registerTool(
    'dataverse_update_row',
    {
      title: 'Update Dataverse Row',
      description: 'Patch a Dataverse row by GUID.',
      inputSchema: {
        table: z.string().describe('Dataverse entity set name'),
        id: z.string().describe('Dataverse row GUID'),
        data: z.record(z.string(), z.unknown()).describe('Patch payload'),
        ifMatch: z.string().optional().default('*').describe('ETag precondition, default *'),
      },
    },
    async ({ table, id, data, ifMatch = '*' }) =>
      runWithDataverseToken(getInboundAccessToken, authMode, async (token) => {
        const entitySet = normalizeTable(table);
        const rowId = normalizeRowId(id);
        return callDataverse(token, {
          method: 'PATCH',
          path: `${entitySet}(${encodeURIComponent(rowId)})`,
          headers: { 'If-Match': ifMatch },
          body: data,
        });
      })
  );

  server.registerTool(
    'dataverse_delete_row',
    {
      title: 'Delete Dataverse Row',
      description: 'Delete a Dataverse row by GUID.',
      inputSchema: {
        table: z.string().describe('Dataverse entity set name'),
        id: z.string().describe('Dataverse row GUID'),
        ifMatch: z.string().optional().default('*').describe('ETag precondition, default *'),
      },
    },
    async ({ table, id, ifMatch = '*' }) =>
      runWithDataverseToken(getInboundAccessToken, authMode, async (token) => {
        const entitySet = normalizeTable(table);
        const rowId = normalizeRowId(id);
        return callDataverse(token, {
          method: 'DELETE',
          path: `${entitySet}(${encodeURIComponent(rowId)})`,
          headers: { 'If-Match': ifMatch },
        });
      })
  );

  return server;
}
