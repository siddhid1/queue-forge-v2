import type { MetricsRepository, StatusCount } from "./metrics.repository.js";

function toStatusMap(rows: StatusCount[]): Record<string, number> {
  return Object.fromEntries(rows.map((row) => [row.status, row.count]));
}

function sum(values: Record<string, number>): number {
  return Object.values(values).reduce((total, value) => total + value, 0);
}

export class OperationsMetricsService {
  constructor(
    private readonly repository: MetricsRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getSnapshot(windowMinutes: number) {
    const generatedAt = this.now();
    const since = new Date(generatedAt.getTime() - windowMinutes * 60_000);
    const record = await this.repository.getSnapshot(since);
    const jobsByStatus = toStatusMap(record.jobsByStatus);
    const workersByStatus = toStatusMap(record.workersByStatus);
    const terminal = (jobsByStatus.COMPLETED ?? 0) + (jobsByStatus.FAILED ?? 0) + (jobsByStatus.DEAD_LETTER ?? 0);

    return {
      generatedAt: generatedAt.toISOString(),
      window: {
        minutes: windowMinutes,
        from: since.toISOString(),
        jobsCreated: record.jobsCreatedInWindow,
        jobsCompleted: record.jobsCompletedInWindow,
        jobsFailed: record.jobsFailedInWindow,
        throughputPerMinute: record.jobsCompletedInWindow / windowMinutes,
      },
      jobs: {
        total: sum(jobsByStatus),
        byStatus: jobsByStatus,
        retryAttempts: record.retryAttempts,
        successRate: terminal === 0 ? null : (jobsByStatus.COMPLETED ?? 0) / terminal,
      },
      workers: {
        total: sum(workersByStatus),
        byStatus: workersByStatus,
      },
    };
  }
}
