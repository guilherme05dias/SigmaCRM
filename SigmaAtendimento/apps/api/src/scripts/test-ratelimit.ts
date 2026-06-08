import { rateLimit } from '../middlewares/rateLimit.middleware';
import { Request, Response, NextFunction } from 'express';

const req = {
  ip: '127.0.0.1',
  user: { companyId: 'test-company-123' },
} as Request;

const res = {
  setHeader: (name: string, value: string) => {
    console.log(`[Header] ${name}: ${value}`);
  },
  status: (code: number) => {
    console.log(`[Status] ${code}`);
    return res;
  },
  json: (data: any) => {
    console.log(`[JSON]`, data);
    return res;
  }
} as unknown as Response;

const next: NextFunction = () => {
  console.log('[Next] Chamado');
};

const limitMiddleware = rateLimit(1000, 2); // 2 requests per 1000ms

console.log('--- Request 1 ---');
limitMiddleware(req, res, next);

console.log('--- Request 2 ---');
limitMiddleware(req, res, next);

console.log('--- Request 3 (Deve falhar) ---');
limitMiddleware(req, res, next);

setTimeout(() => {
  console.log('--- Request 4 (Após 1s, deve passar) ---');
  limitMiddleware(req, res, next);
  console.log('Teste concluído!');
}, 1100);
