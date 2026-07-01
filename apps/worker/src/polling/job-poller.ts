import { QueueService } from "@queue-forge/redis";

export class JobPoller {
  constructor(private readonly queue = new QueueService()) {}

  async poll() {
    const jobId = await this.queue.dequeue(1);

    return jobId;
  }
}
