import { createServer, type Server } from "node:http";
import { WorkerService } from "./services/worker.service.js";
import { WorkerRegistryService } from "./registry/worker-registry-service.js";
import { HeartbeatService } from "./heartbeat/heartbeat.service.js";
import { logger } from "@queue-forge/logger";
import { register } from "@queue-forge/metrics";
import { redisClient } from "@queue-forge/redis";

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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
    logger.info({ port }, "Worker metrics server started");
  });

  return server;
}

async function bootstrap() {
  await redisClient.connect();

  const registry = new WorkerRegistryService();
  const workerId = await registry.register();

  const heartbeat = new HeartbeatService();
  heartbeat.start(workerId);

  const worker = new WorkerService(workerId);
  const metricsServer = startMetricsServer(readPositiveInteger(process.env.WORKER_METRICS_PORT, 9101));
  const workerRun = worker.start();
  let shutdownStarted = false;

  const shutdown = async (signal: NodeJS.Signals) => {
    if (shutdownStarted) {
      return;
    }

    shutdownStarted = true;
    logger.info({ signal, workerId }, "Worker shutdown requested");
    worker.requestShutdown();

    const shutdownTimeoutMs = readPositiveInteger(process.env.WORKER_SHUTDOWN_TIMEOUT_MS, 30_000);
    await Promise.race([workerRun, sleep(shutdownTimeoutMs)]);
    await worker.releaseActiveLease();
    metricsServer.close();
    heartbeat.stop();
    await redisClient.quit();
    await registry.unregister(workerId);
    logger.info({ workerId }, "Worker shutdown complete");
    process.exit(0);
  };

  process.once("SIGTERM", (signal) => {
    void shutdown(signal);
  });

  process.once("SIGINT", (signal) => {
    void shutdown(signal);
  });

  await workerRun;
}

bootstrap().catch((error: unknown) => {
  logger.error({ error }, "Worker failed");
  process.exitCode = 1;
});
