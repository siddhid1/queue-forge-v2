import { db, auditLogs } from "@queue-forge/database";
import type { OperationsJobRepository } from "./job.repository.js";
import { ResourceNotFoundError, InvalidStateTransitionError, ConflictError } from "../../../errors/api.error.js";
import { validTransitions } from "./job.types.js";

export class OperationsJobCommandService {
  constructor(
    private readonly repository: OperationsJobRepository,
    private readonly writeAuditLog: (entry: {
      actorId: string;
      action: string;
      targetType: string;
      targetId: string;
      reason: string;
      outcome: string;
      requestId?: string;
      changeSummary: Record<string, unknown>;
    }) => Promise<void> = async (entry) => {
      await db.insert(auditLogs).values(entry);
    },
  ) {}

  async retry(jobId: string, reason: string, actorId: string, requestId?: string): Promise<{ id: string; status: string; version: number }> {
    const job = await this.repository.findById(jobId);
    if (!job) throw new ResourceNotFoundError("Job", jobId);

    const allowed = validTransitions[job.status];
    if (!allowed?.includes("PENDING")) {
      throw new InvalidStateTransitionError(job.status, "PENDING");
    }

    const result = await this.repository.updateStatus(jobId, "PENDING", job.version);
    if (!result) throw new ConflictError("Job was modified concurrently; retry the request");

    await this.repository.createJobEvent({
      jobId,
      eventType: "job.retry.requested",
      fromStatus: job.status,
      toStatus: "PENDING",
      version: result.version,
      actorType: "operator",
      actorId,
      metadata: { reason },
    });

    await this.writeAuditLog({
      actorId,
      action: "job.retry",
      targetType: "job",
      targetId: jobId,
      reason,
      outcome: "accepted",
      requestId,
      changeSummary: { fromStatus: job.status, toStatus: "PENDING", previousVersion: job.version },
    });

    return { id: result.id, status: result.status, version: result.version };
  }

  async cancel(jobId: string, reason: string, actorId: string, requestId?: string): Promise<{ id: string; status: string; version: number }> {
    const job = await this.repository.findById(jobId);
    if (!job) throw new ResourceNotFoundError("Job", jobId);

    const allowed = validTransitions[job.status];
    if (!allowed?.includes("CANCELED")) {
      throw new InvalidStateTransitionError(job.status, "CANCELED");
    }

    const result = await this.repository.updateStatus(jobId, "CANCELED", job.version);
    if (!result) throw new ConflictError("Job was modified concurrently; retry the request");

    await this.repository.createJobEvent({
      jobId,
      eventType: "job.canceled",
      fromStatus: job.status,
      toStatus: "CANCELED",
      version: result.version,
      actorType: "operator",
      actorId,
      metadata: { reason },
    });

    await this.writeAuditLog({
      actorId,
      action: "job.cancel",
      targetType: "job",
      targetId: jobId,
      reason,
      outcome: "accepted",
      requestId,
      changeSummary: { fromStatus: job.status, toStatus: "CANCELED", previousVersion: job.version },
    });

    return { id: result.id, status: result.status, version: result.version };
  }
}
