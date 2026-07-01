import { ResourceNotFoundError, ConflictError } from "../../../errors/api.error.js";
import type { QueueExecutionRepository } from "./queue-execution.repository.js";
import type { QueueRepository } from "./queue.repository.js";
import { queueNames, type QueueJobGroup, type QueueName, type QueueSummary, type QueueStateChange } from "./queue.types.js";

const pendingStatuses = new Set(["PENDING", "RETRYING"]);

export interface QueueLogger {
  warn(context: Record<string, unknown>, message: string): void;
}

function resolveQueueName(priority: number): QueueName {
  if (priority >= 10) return "high";
  if (priority >= 5) return "medium";
  return "low";
}

function emptySummary(name: QueueName): QueueSummary {
  return {
    name,
    authoritativeDepth: 0,
    executionDepth: null,
    oldestPendingAt: null,
    statusCounts: {},
    executionLayerAvailable: false,
    state: "ACTIVE",
    pausedAt: null,
    stateReason: null,
  };
}

export class OperationsQueueService {
  constructor(
    private readonly repository: QueueRepository,
    private readonly executionRepository: QueueExecutionRepository,
    private readonly logger: QueueLogger,
  ) {}

  async list(): Promise<QueueSummary[]> {
    const groups = await this.repository.getJobGroups();
    const summaries = new Map<QueueName, QueueSummary>(queueNames.map((name) => [name, emptySummary(name)]));

    for (const group of groups) {
      this.addGroup(summaries.get(resolveQueueName(group.priority))!, group);
    }

    await Promise.all(
      queueNames.map(async (name) => {
        const state = await this.repository.getQueueState(name);
        const summary = summaries.get(name)!;
        if (state) {
          summary.state = state.state;
          summary.pausedAt = state.pausedAt?.toISOString() ?? null;
          summary.stateReason = state.stateReason;
        }
        await this.loadExecutionDepth(summary);
      }),
    );

    return queueNames.map((name) => summaries.get(name)!);
  }

  async get(name: string): Promise<QueueSummary> {
    if (!queueNames.includes(name as QueueName)) {
      throw new ResourceNotFoundError("Queue", name);
    }

    const queues = await this.list();
    return queues.find((queue) => queue.name === name)!;
  }

  async pause(name: string, reason: string): Promise<QueueStateChange> {
    if (!queueNames.includes(name as QueueName)) {
      throw new ResourceNotFoundError("Queue", name);
    }

    const current = await this.repository.getQueueState(name);
    if (current?.state === "PAUSED") {
      throw new ConflictError(`Queue '${name}' is already paused`);
    }

    const result = await this.repository.setQueueState(name, "PAUSED", reason);
    if (!result) throw new ResourceNotFoundError("Queue", name);

    return {
      name: name as QueueName,
      state: "PAUSED",
      reason,
      pausedAt: result.pausedAt?.toISOString() ?? new Date().toISOString(),
    };
  }

  async resume(name: string, reason: string): Promise<QueueStateChange> {
    if (!queueNames.includes(name as QueueName)) {
      throw new ResourceNotFoundError("Queue", name);
    }

    const current = await this.repository.getQueueState(name);
    if (current?.state === "ACTIVE") {
      throw new ConflictError(`Queue '${name}' is already active`);
    }

    const result = await this.repository.setQueueState(name, "ACTIVE", reason);
    if (!result) throw new ResourceNotFoundError("Queue", name);

    return {
      name: name as QueueName,
      state: "ACTIVE",
      reason,
      pausedAt: null,
    };
  }

  private addGroup(summary: QueueSummary, group: QueueJobGroup): void {
    summary.statusCounts[group.status] = (summary.statusCounts[group.status] ?? 0) + group.count;

    if (!pendingStatuses.has(group.status)) return;

    summary.authoritativeDepth += group.count;
    if (
      group.oldestCreatedAt &&
      (!summary.oldestPendingAt || group.oldestCreatedAt < new Date(summary.oldestPendingAt))
    ) {
      summary.oldestPendingAt = group.oldestCreatedAt.toISOString();
    }
  }

  private async loadExecutionDepth(summary: QueueSummary): Promise<void> {
    try {
      summary.executionDepth = await this.executionRepository.getDepth(summary.name);
      summary.executionLayerAvailable = true;
    } catch (error) {
      summary.executionDepth = null;
      summary.executionLayerAvailable = false;
      this.logger.warn({ error, queueName: summary.name }, "Unable to read Redis queue depth");
    }
  }
}
