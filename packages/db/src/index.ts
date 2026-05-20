import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __bharatboot_prisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  global.__bharatboot_prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.__bharatboot_prisma = prisma;
}

export * from "@prisma/client";
