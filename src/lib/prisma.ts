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

function createPrismaClient(): PrismaClient {
  const rawDatabaseUrl = process.env.DATABASE_URL;
  if (rawDatabaseUrl === undefined) {
    throw new Error('DATABASE_URL is not set.');
  }
  const client = new PrismaClient({
    datasources: { db: { url: withConnectionDefaults(rawDatabaseUrl) } },
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = client;
  }
  return client;
}

let prismaClient: PrismaClient | undefined;

function getPrismaClient(): PrismaClient {
  if (!prismaClient) {
    prismaClient = globalForPrisma.prisma ?? createPrismaClient();
  }
  return prismaClient;
}

// The client is created lazily, on first query access, so `next build` can
// collect page data without a database connection — DATABASE_URL is only
// required (and checked) when a query actually runs. A Proxy keeps every
// existing `prisma.<delegate>` call site unchanged.
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrismaClient();
    const value = Reflect.get(client, prop);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});