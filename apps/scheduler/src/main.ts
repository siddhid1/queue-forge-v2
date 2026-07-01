import { createServer, type Server } from "node:http";
import { logger } from "@queue-forge/logger";
import { register } from "@queue-forge/metrics";
import { redisClient } from "@queue-forge/redis";
import { DelayedJobPromoter } from "./delayed-job-promoter.js";

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
    logger.info({ port }, "Scheduler metrics server started");
  });

  return server;
}

async function bootstrap(): Promise<void> {
  const intervalMs = readPositiveInteger(process.env.SCHEDULER_INTERVAL_MS, 1_000);
  const metricsPort = readPositiveInteger(process.env.SCHEDULER_METRICS_PORT, 9103);
  const promoter = new DelayedJobPromoter();
  const metricsServer = startMetricsServer(metricsPort);
  let shutdownRequested = false;

  await redisClient.connect();

  const shutdown = async (signal: NodeJS.Signals) => {
    logger.info({ signal }, "Scheduler shutdown requested");
    shutdownRequested = true;
  };

  process.once("SIGTERM", (signal) => {
    void shutdown(signal);
  });

  process.once("SIGINT", (signal) => {
    void shutdown(signal);
  });

  while (!shutdownRequested) {
    try {
      await promoter.promoteDueJobs();
    } catch (error) {
      logger.error({ error }, "Delayed job promotion failed");
    }

    await new Promise((resolve) => {
      setTimeout(resolve, intervalMs);
    });
  }

  metricsServer.close();
  await redisClient.quit();
}

bootstrap().catch((error: unknown) => {
  logger.error({ error }, "Scheduler failed");
  process.exitCode = 1;
});
