import * as z from 'zod/v4';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Cat } from '../models/Cat.js';

export function buildMcpServer() {
  const server = new McpServer(
    { name: 'mcp-cats', version: '0.1.0' },
    { capabilities: { logging: {} } }
  );

  server.registerTool(
    'cats_list',
    {
      title: 'List Cats',
      description: 'Return all cats (newest first)',
      inputSchema: {},
      outputSchema: {
        cats: z.array(
          z.object({
            _id: z.string(),
            name: z.string(),
            imageUrl: z.string().optional(),
            description: z.string().optional(),
          })
        ),
      },
    },
    async () => {
      const cats = await Cat.find().sort({ createdAt: -1 }).lean();
      const output = { cats: cats.map(c => ({ ...c, _id: String(c._id) })) };
      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  server.registerTool(
    'cats_get',
    {
      title: 'Get Cat',
      description: 'Get a single cat by Mongo _id',
      inputSchema: { id: z.string().describe('Mongo _id') },
    },
    async ({ id }) => {
      const cat = await Cat.findById(id).lean();
      if (!cat) {
        return { content: [{ type: 'text', text: 'Not found' }], isError: true };
      }
      const output = { cat: { ...cat, _id: String(cat._id) } };
      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  server.registerTool(
    'cats_add',
    {
      title: 'Add Cat',
      description: 'Create a new cat record',
      inputSchema: {
        name: z.string().min(1),
        imageUrl: z.string().optional().default(''),
        description: z.string().optional().default(''),
      },
    },
    async ({ name, imageUrl = '', description = '' }) => {
      const created = await Cat.create({ name, imageUrl, description });
      const output = { cat: { ...created.toObject(), _id: String(created._id) } };
      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  server.registerTool(
    'cats_update',
    {
      title: 'Update Cat',
      description: 'Update an existing cat by _id',
      inputSchema: {
        id: z.string(),
        name: z.string().min(1).optional(),
        imageUrl: z.string().optional(),
        description: z.string().optional(),
      },
    },
    async ({ id, ...patch }) => {
      const updated = await Cat.findByIdAndUpdate(id, patch, { new: true }).lean();
      if (!updated) {
        return { content: [{ type: 'text', text: 'Not found' }], isError: true };
      }
      const output = { cat: { ...updated, _id: String(updated._id) } };
      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  server.registerTool(
    'cats_delete',
    {
      title: 'Delete Cat',
      description: 'Delete a cat by _id',
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      const deleted = await Cat.findByIdAndDelete(id).lean();
      if (!deleted) {
        return { content: [{ type: 'text', text: 'Not found' }], isError: true };
      }
      const output = { deleted: { ...deleted, _id: String(deleted._id) } };
      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  return server;
}
