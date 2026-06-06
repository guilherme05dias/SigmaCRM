import { prisma } from './prisma';

export async function ensureRuntimeSchema() {
  await prisma.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "message_signature" TEXT');
}
