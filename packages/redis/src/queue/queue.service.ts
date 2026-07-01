import { redisClient } from "../client.js";
import { QUEUES } from "./queues.constants.js";

export class QueueService {
  async getQueueDepth(queueName: string): Promise<number> {
    return await redisClient.lLen(queueName);
  }

  async enqueue(jobId: string, priority: number): Promise<void> {
    const queue = this.resolveQueue(priority);
    await redisClient.lPush(queue, jobId);
  }

  async enqueueDelayed(jobId: string, delayMs: number): Promise<void> {
    await redisClient.zAdd(QUEUES.DELAYED, {
      score: Date.now() + delayMs,
      value: jobId,
    });
  }

  async dequeue(timeoutSeconds = 0): Promise<string | null> {
    const result = await redisClient.brPop(
      [QUEUES.HIGH, QUEUES.MEDIUM, QUEUES.LOW],
      timeoutSeconds,
    );

    return result?.element ?? null;
  }

  private resolveQueue(priority: number): string {
    if (priority >= 10) {
      return QUEUES.HIGH;
    }

    if (priority >= 5) {
      return QUEUES.MEDIUM;
    }

    return QUEUES.LOW;
  }
}
