import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

/**
 * Geração de protocolo do ticket (ADR-07).
 * Formato: ATD{YYYYMMDD}-{seq:03d} com RESET DIÁRIO, contador por empresa+dia
 * (tabela Counter), incrementado transacionalmente para evitar corrida.
 */

type Client = Prisma.TransactionClient | typeof prisma;

function todayYmd(d = new Date()): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

export async function generateProtocol(companyId: string, client: Client = prisma): Promise<string> {
  const ymd = todayYmd();
  const scope = `ATD-${ymd}`;
  const counter = await client.counter.upsert({
    where: { companyId_scope: { companyId, scope } },
    create: { companyId, scope, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `ATD${ymd}-${String(counter.value).padStart(3, '0')}`;
}
