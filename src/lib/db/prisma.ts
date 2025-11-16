import "server-only";

import { PrismaClient } from "@prisma/client";

import { env } from "@/lib/env";

type GlobalWithPrisma = typeof globalThis & {
  __PRISMA_CLIENT__?: PrismaClient;
};

const globalForPrisma = globalThis as GlobalWithPrisma;

function createPrismaClient(): PrismaClient {
  const databaseUrl = env.DB_CONNECTION_STRING?.trim();
  if (!databaseUrl) {
    throw new Error("DB_CONNECTION_STRING es requerido para inicializar PrismaClient");
  }

  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim().length === 0) {
    process.env.DATABASE_URL = databaseUrl;
  }

  return new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });
}

export const prisma: PrismaClient = globalForPrisma.__PRISMA_CLIENT__ ?? createPrismaClient();

if (!env.isProduction) {
  globalForPrisma.__PRISMA_CLIENT__ = prisma;
}
