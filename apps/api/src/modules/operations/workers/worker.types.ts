export const workerHealthValues = ["HEALTHY", "STALE", "OFFLINE"] as const;

export type WorkerHealth = (typeof workerHealthValues)[number];

export interface WorkerRecord {
  id: string;
  hostname: string;
  status: string;
  lastHeartbeat: Date | null;
  createdAt: Date;
}

export interface WorkerSummary {
  id: string;
  hostname: string;
  status: string;
  health: WorkerHealth;
  lastHeartbeat: string | null;
  heartbeatAgeMs: number | null;
  createdAt: string;
}
