import { QueueService } from "@queue-forge/redis";
import { BackoffStrategy } from "./backoff.strategy.js";

export class RetryService {
  private readonly queue = new QueueService();
  private readonly backoff = new BackoffStrategy();

  async retry(jobId: string, attempts: number): Promise<void> {
    const delay = this.backoff.calculateDelay(attempts);
    await this.queue.enqueueDelayed(jobId, delay);
  }
}
