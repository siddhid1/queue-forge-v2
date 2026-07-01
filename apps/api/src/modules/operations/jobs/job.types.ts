export interface JobRecord {
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

export interface JobExecutionRecord {
  id: string;
  jobId: string;
  startedAt: string;
  finishedAt: string | null;
  status: string | null;
  errorMessage: string | null;
}

export interface JobEventRecord {
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

export interface JobPage {
  items: JobSummary[];
  nextCursor: string | null;
}

export interface JobCursor {
  createdAt: string;
  id: string;
}

export const validTransitions: Record<string, string[]> = {
  FAILED: ["PENDING"],
  DEAD_LETTER: ["PENDING"],
  PENDING: ["CANCELED"],
  RETRYING: ["CANCELED"],
  RUNNING: ["CANCELED"],
};
