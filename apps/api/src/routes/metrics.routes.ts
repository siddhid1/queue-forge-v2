import { Router, type Router as RouterType } from "express";
import { register } from "@queue-forge/metrics";

const router: RouterType = Router();

router.get("/metrics", async (_req, res) => {
  res.set("Content-Type", register.contentType);
  res.send(await register.metrics());
});

export default router;
