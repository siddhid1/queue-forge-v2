import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { createJobSchema } from "./job.schema.js";
import { JobController } from "./job.controller.js";
import { validateIdempotencyKey } from "../../middleware/idempotency.middleware.js";

const router: Router = Router();

const controller = new JobController();

router.post("/", validateIdempotencyKey, validate(createJobSchema), controller.create);

export default router;
