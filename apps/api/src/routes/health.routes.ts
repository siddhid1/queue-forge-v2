import { Router, type Router as RouterType } from "express";

const router: RouterType = Router();

router.get("/health", (_req, res) => {
  return res.json({
    status: "UP",
    timestamp: new Date(),
  });
});

export default router;
