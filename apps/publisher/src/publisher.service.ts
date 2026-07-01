import { logger as defaultLogger } from "@queue-forge/logger";
import {
  outboxEventsFailed,
  outboxEventsPublished,
  outboxLagSeconds,
  outboxPendingEvents,
  outboxPublishDuration,
} from "@queue-forge/metrics";
import { OutboxRepository, type OutboxEvent } from "@queue-forge/database";
import { QueueService } from "@queue-forge/redis";

type Logger = typeof defaultLogger;

type DispatchPayload = {
  jobId: string;
  priority: number;
  name?: string;
};

export type OutboxPublisherOptions = {
  workerId: string;
  batchSize?: number;
  pollIntervalMs?: number;
  maxRetries?: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown publisher error";
}

function parseDispatchPayload(payload: unknown): DispatchPayload {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("Outbox event payload must be an object");
  }

  const maybePayload = payload as Partial<DispatchPayload>;

  if (typeof maybePayload.jobId !== "string" || maybePayload.jobId.length === 0) {
    throw new Error("Outbox event payload is missing jobId");
  }

  if (typeof maybePayload.priority !== "number" || !Number.isInteger(maybePayload.priority)) {
    throw new Error("Outbox event payload is missing integer priority");
  }

  return {
    jobId: maybePayload.jobId,
    priority: maybePayload.priority,
    name: typeof maybePayload.name === "string" ? maybePayload.name : undefined,
  };
}

export class OutboxPublisherService {
  private readonly batchSize: number;
  private readonly pollIntervalMs: number;
  private readonly maxRetries: number;
  private shutdownRequested = false;

  constructor(
    private readonly outboxRepository: Pick<
      OutboxRepository,
      "claimBatch" | "markProcessed" | "markFailed" | "getLagMetric"
    >,
    private readonly queueService: Pick<QueueService, "enqueue">,
    private readonly workerId: string,
    private readonly logger: Logger = defaultLogger,
    options: Omit<OutboxPublisherOptions, "workerId"> = {},
  ) {
    this.batchSize = options.batchSize ?? 50;
    this.pollIntervalMs = options.pollIntervalMs ?? 100;
    this.maxRetries = options.maxRetries ?? 5;
  }

  async start(): Promise<void> {
    this.logger.info({ workerId: this.workerId }, "Outbox publisher started");

    while (!this.shutdownRequested) {
      await this.processBatch();
      await this.updateLagMetrics();

      if (!this.shutdownRequested) {
        await sleep(this.pollIntervalMs);
      }
    }

    this.logger.info({ workerId: this.workerId }, "Outbox publisher stopped");
  }

  async processBatch(): Promise<number> {
    const events = await this.outboxRepository.claimBatch(this.workerId, this.batchSize);

    for (const event of events) {
      await this.processEvent(event);
    }

    return events.length;
  }

  async publishEvent(event: OutboxEvent): Promise<void> {
    if (event.eventType !== "job.dispatch.requested") {
      throw new Error(`Unsupported outbox event type: ${event.eventType}`);
    }

    const payload = parseDispatchPayload(event.payload);
    await this.queueService.enqueue(payload.jobId, payload.priority);
  }

  shutdown(): void {
    this.shutdownRequested = true;
  }

  private async processEvent(event: OutboxEvent): Promise<void> {
    const endTimer = outboxPublishDuration.startTimer();

    try {
      if (event.attempts >= this.maxRetries) {
        throw new Error(`Outbox event exceeded max retries (${this.maxRetries})`);
      }

      await this.publishEvent(event);
      await this.outboxRepository.markProcessed(event.id);
      outboxEventsPublished.inc();
      this.logger.info({ eventId: event.id, eventType: event.eventType }, "Outbox event published");
    } catch (error) {
      outboxEventsFailed.inc();
      await this.outboxRepository.markFailed(event.id, errorMessage(error));
      this.logger.error({ eventId: event.id, error }, "Outbox event publish failed");
    } finally {
      endTimer();
    }
  }

  private async updateLagMetrics(): Promise<void> {
    const lag = await this.outboxRepository.getLagMetric();
    outboxLagSeconds.set(lag.oldestUnprocessedAgeMs / 1000);
    outboxPendingEvents.set(lag.count);
  }
}
