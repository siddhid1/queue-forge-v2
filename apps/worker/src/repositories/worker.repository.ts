import { db, workers } from "@queue-forge/database";
import { eq } from "drizzle-orm";

export class WorkerRepository {
  async register(workerId: string, hostname: string) {
    await db.insert(workers).values({
      id: workerId,
      hostname,
      status: "ACTIVE",
      lastHeartbeat: new Date(),
    });
  }

  async heartbeat(workerId: string) {
    await db.update(workers).set({ lastHeartbeat: new Date() }).where(eq(workers.id, workerId));
  }

  async markDead(workerId: string) {
    await db.update(workers).set({ status: "DEAD" }).where(eq(workers.id, workerId));
  }
}
