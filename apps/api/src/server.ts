import { app } from "./app.js";
import { redisClient } from "@queue-forge/redis";
import { logger } from "@queue-forge/logger";

const PORT = process.env.PORT || 3000;

async function bootstrap() {
  await redisClient.connect();

  app.listen(PORT, () => {
    logger.info({ port: PORT }, "API server started");
  });
}

bootstrap().catch((error: unknown) => {
  logger.error({ error }, "API server failed");
  process.exitCode = 1;
});
