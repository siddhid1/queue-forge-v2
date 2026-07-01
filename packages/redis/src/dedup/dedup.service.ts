import { redisClient } from "../client.js";

export class DedupService {
  async exists(key: string) {
    return Boolean(await redisClient.get(key));
  }

  async remember(key: string, jobId: string) {
    await redisClient.set(key, jobId, { EX: 3600 });
  }
}
