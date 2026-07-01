import { jobsCompleted, jobsFailed, executionLatency } from "@queue-forge/metrics";
import { JobPoller } from "../polling/job-poller.js";
import { JobExecutor } from "../execution/job-executor.js";
import { JobRepository } from "../repositories/job.repository.js";
import { RetryService } from "../retry/retry.service.js";
import { DeadLetterService } from "../dead-letter/dead-letter.service.js";

export class WorkerService {
  private readonly leaseTtlMs: number;
  private readonly leaseRenewalIntervalMs: number;
  private shutdownRequested = false;
  private activeLease: { jobId: string; fencingToken: number } | null = null;
  private readonly poller = new JobPoller();
  private readonly executor = new JobExecutor();
  private readonly repository = new JobRepository();
  private readonly retryService = new RetryService();
  private readonly deadLetterService = new DeadLetterService();

  constructor(
    private readonly workerId: string,
    options: { leaseTtlMs?: number; leaseRenewalIntervalMs?: number } = {},
  ) {
    this.leaseTtlMs = options.leaseTtlMs ?? 30_000;
    this.leaseRenewalIntervalMs = options.leaseRenewalIntervalMs ?? 10_000;
  }

  async start() {
    while (!this.shutdownRequested) {
      const endTimer = executionLatency.startTimer();
      const jobId = await this.poller.poll();

      if (!jobId) {
        endTimer();
        continue;
      }

      const lease = await this.repository.acquireLease(jobId, this.workerId, this.leaseTtlMs);

      if (!lease) {
        endTimer();
        continue;
      }

      this.activeLease = { jobId, fencingToken: lease.fencingToken };
      const job = await this.repository.findById(jobId);

      if (!job) {
        await this.repository.releaseLease(jobId, this.workerId, lease.fencingToken);
        this.activeLease = null;
        endTimer();
        continue;
      }

      const renewal = setInterval(() => {
        void this.repository.renewLease(job.id, this.workerId, lease.fencingToken, this.leaseTtlMs);
      }, this.leaseRenewalIntervalMs);

      try {
        const markedRunning = await this.repository.markRunningWithLease(job.id, this.workerId, lease.fencingToken);

        if (!markedRunning) {
          continue;
        }

        await this.executor.execute(job);
        const markedCompleted = await this.repository.markCompletedWithLease(job.id, this.workerId, lease.fencingToken);

        if (!markedCompleted) {
          continue;
        }

        jobsCompleted.inc();
      } catch (error) {
        jobsFailed.inc();

        if (job.attempts < job.maxAttempts) {
          await this.retryService.retry(job.id, job.attempts);
          await this.repository.incrementAttempts(job.id);
        } else {
          await this.deadLetterService.moveToDeadLetter(job, error);
        }
      } finally {
        clearInterval(renewal);
        await this.repository.releaseLease(job.id, this.workerId, lease.fencingToken);
        this.activeLease = null;
        endTimer();
      }
    }
  }

  requestShutdown(): void {
    this.shutdownRequested = true;
  }

  async releaseActiveLease(): Promise<void> {
    if (!this.activeLease) {
      return;
    }

    await this.repository.releaseLease(this.activeLease.jobId, this.workerId, this.activeLease.fencingToken);
    this.activeLease = null;
  }
}
