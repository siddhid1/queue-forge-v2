export interface MetricsSnapshot {
  generatedAt: string;
  window: {
    minutes: number;
    from: string;
    jobsCreated: number;
    jobsCompleted: number;
    jobsFailed: number;
    throughputPerMinute: number;
  };
  jobs: {
    total: number;
    byStatus: Record<string, number>;
    retryAttempts: number;
    successRate: number | null;
  };
  workers: {
    total: number;
    byStatus: Record<string, number>;
  };
}

export interface QueueSummary {
  name: string;
  authoritativeDepth: number;
  executionDepth: number | null;
  oldestPendingAt: string | null;
  statusCounts: Record<string, number>;
  executionLayerAvailable: boolean;
  state: string;
  pausedAt: string | null;
  stateReason: string | null;
}

export interface WorkerSummary {
  id: string;
  hostname: string;
  status: string;
  health: string;
  lastHeartbeat: string | null;
  heartbeatAgeMs: number | null;
  createdAt: string;
}

export interface JobSummary {
  id: string;
  name: string;
  priority: number;
  status: string;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  updatedAt: string;
}

export interface JobDetail {
  id: string;
  queueId: string | null;
  name: string;
  payload: Record<string, unknown>;
  priority: number;
  status: string;
  attempts: number;
  maxAttempts: number;
  version: number;
  runAt: string | null;
  cancellationRequestedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobExecution {
  id: string;
  jobId: string;
  startedAt: string;
  finishedAt: string | null;
  status: string | null;
  errorMessage: string | null;
}

export interface JobEvent {
  id: string;
  jobId: string;
  eventType: string;
  fromStatus: string | null;
  toStatus: string | null;
  version: number;
  actorType: string;
  actorId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface DeadLetterRecord {
  id: string;
  jobId: string;
  reason: string | null;
  createdAt: string;
}

export interface AuditRecord {
  id: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string;
  outcome: string;
  requestId: string | null;
  changeSummary: Record<string, unknown>;
  createdAt: string;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface ApiResponse<T> {
  data: T;
}
