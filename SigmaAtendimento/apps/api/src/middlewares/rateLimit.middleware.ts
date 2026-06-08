import { Request, Response, NextFunction } from 'express';

interface Bucket { count: number; resetAt: number; }
const store = new Map<string, Bucket>();

/**
 * @param windowMs janela em ms
 * @param max requisições permitidas na janela
 * @param keyFn como identificar o cliente (default: companyId ou IP)
 */
export function rateLimit(windowMs: number, max: number, keyFn?: (req: Request) => string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = keyFn ? keyFn(req) : (req.user?.companyId || req.ip || 'global');
    const now = Date.now();
    const bucket = store.get(key);

    if (!bucket || now > bucket.resetAt) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (bucket.count >= max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Limite de requisições excedido. Tente novamente em breve.' });
    }
    bucket.count += 1;
    next();
  };
}

// Limpeza periódica de buckets expirados
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of store) if (now > v.resetAt) store.delete(k);
}, 60_000).unref();
