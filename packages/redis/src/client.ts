import { createClient } from "redis";
import { logger } from "@queue-forge/logger";

export const redisClient = createClient({
  url: process.env.REDIS_URL,
});

redisClient.on("connect", () => {
  logger.info("Redis connected");
});

redisClient.on("error", (error) => {
  logger.error({ error }, "Redis client error");
});
