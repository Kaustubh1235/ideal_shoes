import Redis from "ioredis";
import env from "@/env";

declare global {
  // eslint-disable-next-line no-var
  var __bharatboot_redis: Redis | undefined;
}

export const redis: Redis =
  global.__bharatboot_redis ??
  new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });

if (process.env.NODE_ENV !== "production") {
  global.__bharatboot_redis = redis;
}
