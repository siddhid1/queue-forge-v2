import type { Job } from "@queue-forge/database";
import { logger as defaultLogger } from "@queue-forge/logger";

export type HandlerFunction = (job: Job) => Promise<void>;

type Logger = typeof defaultLogger;

export class JobExecutor {
  private readonly handlers = new Map<string, HandlerFunction>();

  constructor(private readonly logger: Logger = defaultLogger) {}

  register(jobName: string, handler: HandlerFunction): void {
    this.handlers.set(jobName, handler);
  }

  async execute(job: Job): Promise<void> {
    const handler = this.handlers.get(job.name);

    if (!handler) {
      throw new Error(`No handler registered for job name: ${job.name}`);
    }

    this.logger.info({ jobId: job.id, jobName: job.name }, "Executing job");
    await handler(job);
  }
}
