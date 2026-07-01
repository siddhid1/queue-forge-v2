import { Router } from "express";

import jobRoutes from "../modules/jobs/job.routes.js";
import { createOperationsRouter } from "../modules/operations/operations.routes.js";
import metricsRoutes from "./metrics.routes.js";

const router: Router = Router();

router.use("/jobs", jobRoutes);
router.use("/operations", createOperationsRouter());
router.use(metricsRoutes);

export default router;
