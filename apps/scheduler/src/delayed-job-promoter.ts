import { eq } from "drizzle-orm";
import { db, jobs } from "@queue-forge/database";
import { delayedJobsPromoted } from "@queue-forge/metrics";
import { QUEUES, redisClient } from "@queue-forge/redis";

const MOVE_DUE_JOB_SCRIPT = `
local score = redis.call("ZSCORE", KEYS[1], ARGV[1])
if not score then
  return 0
end
if tonumber(score) > tonumber(ARGV[2]) then
  return 0
end
redis.call("LPUSH", KEYS[2], ARGV[1])
redis.call("ZREM", KEYS[1], ARGV[1])
return 1
`;

export function resolvePriorityQueue(priority: number): string {
  if (priority >= 10) {
    return QUEUES.HIGH;
  }

  if (priority >= 5) {
    return QUEUES.MEDIUM;
  }

  return QUEUES.LOW;
}

export class DelayedJobPromoter {
  async promoteDueJobs(now = Date.now()): Promise<number> {
    const dueJobIds = await redisClient.zRangeByScore(QUEUES.DELAYED, "-inf", now);
    let promoted = 0;

    for (const jobId of dueJobIds) {
      const priority = await this.findJobPriority(jobId);

      if (priority === null) {
        continue;
      }

      const moved = await redisClient.eval(MOVE_DUE_JOB_SCRIPT, {
        keys: [QUEUES.DELAYED, resolvePriorityQueue(priority)],
        arguments: [jobId, String(now)],
      });

      if (moved === 1) {
        promoted++;
      }
    }

    if (promoted > 0) {
      delayedJobsPromoted.inc(promoted);
    }

    return promoted;
  }

  private async findJobPriority(jobId: string): Promise<number | null> {
    const [job] = await db.select({ priority: jobs.priority }).from(jobs).where(eq(jobs.id, jobId)).limit(1);

    return job?.priority ?? null;
  }
}
