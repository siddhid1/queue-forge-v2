import { WorkerRepository } from "../repositories/worker.repository.js";

export class HeartbeatService {
  private interval: NodeJS.Timeout | null = null;

  constructor(private readonly repository = new WorkerRepository()) {}

  start(workerId: string) {
    this.interval = setInterval(async () => {
      await this.repository.heartbeat(workerId);
    }, 5000);
  }

  stop(): void {
    if (!this.interval) {
      return;
    }

    clearInterval(this.interval);
    this.interval = null;
  }
}
