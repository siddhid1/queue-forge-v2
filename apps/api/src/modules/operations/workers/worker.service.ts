import { InvalidCursorError, ResourceNotFoundError } from "../../../errors/api.error.js";
import type { WorkerRepository } from "./worker.repository.js";
import type { WorkerHealth, WorkerRecord, WorkerSummary } from "./worker.types.js";

export interface ListWorkersOptions {
  health?: WorkerHealth;
  limit: number;
  cursor?: string;
}

interface WorkerCursor {
  createdAt: string;
  id: string;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface WorkerPage {
  items: WorkerSummary[];
  nextCursor: string | null;
}

export class OperationsWorkerService {
  constructor(
    private readonly repository: WorkerRepository,
    private readonly staleAfterMs: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async list(options: ListWorkersOptions): Promise<WorkerPage> {
    const records = await this.repository.list({
      health: options.health,
      limit: options.limit + 1,
      before: options.cursor ? this.decodeCursor(options.cursor) : undefined,
      staleBefore: new Date(this.now().getTime() - this.staleAfterMs),
    });
    const hasMore = records.length > options.limit;
    const page = records.slice(0, options.limit);
    const last = page.at(-1);

    return {
      items: page.map((worker) => this.toSummary(worker)),
      nextCursor: hasMore && last ? this.encodeCursor(last) : null,
    };
  }

  async get(id: string): Promise<WorkerSummary> {
    const worker = await this.repository.findById(id);
    if (!worker) throw new ResourceNotFoundError("Worker", id);
    return this.toSummary(worker);
  }

  private toSummary(worker: WorkerRecord): WorkerSummary {
    const heartbeatAgeMs = worker.lastHeartbeat
      ? Math.max(0, this.now().getTime() - worker.lastHeartbeat.getTime())
      : null;
    const health = this.resolveHealth(worker, heartbeatAgeMs);

    return {
      id: worker.id,
      hostname: worker.hostname,
      status: worker.status,
      health,
      lastHeartbeat: worker.lastHeartbeat?.toISOString() ?? null,
      heartbeatAgeMs,
      createdAt: worker.createdAt.toISOString(),
    };
  }

  private resolveHealth(worker: WorkerRecord, heartbeatAgeMs: number | null): WorkerHealth {
    if (worker.status !== "ACTIVE") return "OFFLINE";
    if (heartbeatAgeMs === null || heartbeatAgeMs > this.staleAfterMs) return "STALE";
    return "HEALTHY";
  }

  private encodeCursor(worker: WorkerRecord): string {
    const cursor: WorkerCursor = { createdAt: worker.createdAt.toISOString(), id: worker.id };
    return Buffer.from(JSON.stringify(cursor)).toString("base64url");
  }

  private decodeCursor(value: string): { createdAt: Date; id: string } {
    try {
      const cursor = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<WorkerCursor>;
      const createdAt = new Date(cursor.createdAt ?? "");
      if (!cursor.id || !uuidPattern.test(cursor.id) || Number.isNaN(createdAt.getTime())) {
        throw new InvalidCursorError();
      }
      return { createdAt, id: cursor.id };
    } catch (error) {
      if (error instanceof InvalidCursorError) throw error;
      throw new InvalidCursorError();
    }
  }
}
