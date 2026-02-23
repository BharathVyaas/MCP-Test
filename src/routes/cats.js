import express from 'express';
import { z } from 'zod';
import { Cat } from '../models/Cat.js';
import { requireApiKey } from '../auth.js';

export const catsRouter = express.Router();

catsRouter.use(requireApiKey);

const CatCreateSchema = z.object({
  name: z.string().min(1),
  imageUrl: z.string().optional().default(''),
  description: z.string().optional().default(''),
});

const CatUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  imageUrl: z.string().optional(),
  description: z.string().optional(),
});

catsRouter.get('/', async (_req, res) => {
  const cats = await Cat.find().sort({ createdAt: -1 }).lean();
  res.json({ data: cats });
});

catsRouter.get('/:id', async (req, res) => {
  const cat = await Cat.findById(req.params.id).lean();
  if (!cat) return res.status(404).json({ error: 'Not found' });
  res.json({ data: cat });
});

catsRouter.post('/', async (req, res) => {
  const parsed = CatCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const cat = await Cat.create(parsed.data);
  res.status(201).json({ data: cat });
});

catsRouter.put('/:id', async (req, res) => {
  const parsed = CatUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const updated = await Cat.findByIdAndUpdate(req.params.id, parsed.data, { new: true }).lean();
  if (!updated) return res.status(404).json({ error: 'Not found' });

  res.json({ data: updated });
});

catsRouter.delete('/:id', async (req, res) => {
  const deleted = await Cat.findByIdAndDelete(req.params.id).lean();
  if (!deleted) return res.status(404).json({ error: 'Not found' });

  res.json({ data: deleted });
});
