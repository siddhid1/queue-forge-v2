export const queueNames = ["high", "medium", "low"] as const;

export type QueueName = (typeof queueNames)[number];

export interface QueueJobGroup {
  priority: number;
  status: string;
  count: number;
  oldestCreatedAt: Date | null;
}

export interface QueueSummary {
  name: QueueName;
  authoritativeDepth: number;
  executionDepth: number | null;
  oldestPendingAt: string | null;
  statusCounts: Record<string, number>;
  executionLayerAvailable: boolean;
  state: string;
  pausedAt: string | null;
  stateReason: string | null;
}

export interface QueueStateChange {
  name: QueueName;
  state: string;
  reason: string;
  pausedAt: string | null;
}
