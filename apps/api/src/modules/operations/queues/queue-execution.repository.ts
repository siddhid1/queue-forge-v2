import type { QueueService } from "@queue-forge/redis";
import type { QueueName } from "./queue.types.js";

const redisQueueNames: Record<QueueName, string> = {
  high: "queue:high",
  medium: "queue:medium",
  low: "queue:low",
};

export interface QueueExecutionRepository {
  getDepth(queueName: QueueName): Promise<number>;
}

export class RedisQueueExecutionRepository implements QueueExecutionRepository {
  constructor(private readonly queueService: QueueService) {}

  getDepth(queueName: QueueName): Promise<number> {
    return this.queueService.getQueueDepth(redisQueueNames[queueName]);
  }
}
