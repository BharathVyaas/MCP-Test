export function requireApiKey(req, res, next) {
  const expected = process.env.MCP_API_KEY;
  if (!expected) return next();

  const got = req.header('x-api-key');
  if (got && got === expected) return next();

  return res.status(401).json({ error: 'Unauthorized (missing/invalid x-api-key)' });
}

export function requireAllowedOrigin(req, res, next) {
  const allowRaw = process.env.ALLOWED_ORIGINS || '';
  const allow = allowRaw.split(',').map(s => s.trim()).filter(Boolean);

  if (allow.length === 0) return next();

  const origin = req.header('origin');
  if (!origin) return res.status(403).json({ error: 'Forbidden (missing Origin)' });

  if (!allow.includes(origin)) {
    return res.status(403).json({ error: `Forbidden (Origin not allowed): ${origin}` });
  }

  return next();
}
