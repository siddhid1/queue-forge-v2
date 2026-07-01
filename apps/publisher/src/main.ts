import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { logger } from "@queue-forge/logger";
import { register } from "@queue-forge/metrics";
import { OutboxRepository } from "@queue-forge/database";
import { QueueService, redisClient } from "@queue-forge/redis";
import { OutboxPublisherService } from "./publisher.service.js";

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function startMetricsServer(port: number): Server {
  const server = createServer(async (req, res) => {
    if (req.url !== "/metrics") {
      res.writeHead(404);
      res.end();
      return;
    }

    res.writeHead(200, { "Content-Type": register.contentType });
    res.end(await register.metrics());
  });

  server.listen(port, () => {
    logger.info({ port }, "Publisher metrics server started");
  });

  return server;
}

async function bootstrap(): Promise<void> {
  const workerId = process.env.PUBLISHER_ID ?? randomUUID();
  const metricsPort = readPositiveInteger(process.env.PUBLISHER_METRICS_PORT, 9102);
  const service = new OutboxPublisherService(
    new OutboxRepository(),
    new QueueService(),
    workerId,
    logger,
    {
      batchSize: readPositiveInteger(process.env.OUTBOX_BATCH_SIZE, 50),
      pollIntervalMs: readPositiveInteger(process.env.OUTBOX_POLL_INTERVAL_MS, 100),
      maxRetries: readPositiveInteger(process.env.OUTBOX_MAX_RETRIES, 5),
    },
  );
  const metricsServer = startMetricsServer(metricsPort);

  await redisClient.connect();
  const publisherRun = service.start();

  const shutdown = (signal: NodeJS.Signals) => {
    logger.info({ signal }, "Publisher shutdown requested");
    service.shutdown();
  };

  process.once("SIGTERM", (signal) => {
    shutdown(signal);
  });

  process.once("SIGINT", (signal) => {
    shutdown(signal);
  });

  await publisherRun;
  metricsServer.close();
  await redisClient.quit();
}

bootstrap().catch((error: unknown) => {
  logger.error({ error }, "Publisher failed");
  process.exitCode = 1;
});
