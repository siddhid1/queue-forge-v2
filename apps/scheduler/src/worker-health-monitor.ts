import { db, workers } from "@queue-forge/database";
import { lt } from "drizzle-orm";

export class WorkerHealthMonitor {
  async checkWorkers() {
    const cutoff = new Date(Date.now() - 15000);
    const staleWorkers = await db.select().from(workers).where(lt(workers.lastHeartbeat, cutoff));

    return staleWorkers;
  }
}
