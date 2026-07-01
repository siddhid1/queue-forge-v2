import { randomUUID } from "node:crypto";
import os from "node:os";
import { WorkerRepository } from "../repositories/worker.repository.js";

export class WorkerRegistryService {
  private readonly repository = new WorkerRepository();

  async register() {
    const workerId = randomUUID();
    await this.repository.register(workerId, os.hostname());

    return workerId;
  }

  async unregister(workerId: string): Promise<void> {
    await this.repository.markDead(workerId);
  }
}
