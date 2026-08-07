import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Serverless providers (e.g. Neon) auto-pause idle computes; the connection
// that wakes the database up can exceed Prisma's default 5s connect timeout.
// Give that first connection longer to complete, and let the pool wait long
// enough for the connect timeout, so cold starts don't fail.
const rawDatabaseUrl = process.env.DATABASE_URL;
const databaseUrl =
  rawDatabaseUrl && rawDatabaseUrl.includes('connect_timeout=')
    ? rawDatabaseUrl
    : `${rawDatabaseUrl ?? ''}${rawDatabaseUrl?.includes('?') ? '&' : '?'}connect_timeout=15&pool_timeout=25`;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: databaseUrl } },
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}