import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Serverless providers (e.g. Neon) auto-pause idle computes; the connection
// that wakes the database up can exceed Prisma's default 5s connect timeout.
// Give that first connection longer to complete, and let the pool wait long
// enough for the connect timeout, so cold starts don't fail. Each parameter is
// only added when it is missing — existing values are preserved and never
// duplicated.
function withConnectionDefaults(raw: string): string {
  const url = new URL(raw);
  if (!url.searchParams.has('connect_timeout')) {
    url.searchParams.set('connect_timeout', '15');
  }
  if (!url.searchParams.has('pool_timeout')) {
    url.searchParams.set('pool_timeout', '25');
  }
  return url.toString();
}

function resolveDatabaseUrl(raw: string | undefined): string {
  if (raw === undefined) {
    throw new Error('DATABASE_URL is not set.');
  }
  return withConnectionDefaults(raw);
}

const databaseUrl = resolveDatabaseUrl(process.env.DATABASE_URL);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: databaseUrl } },
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}