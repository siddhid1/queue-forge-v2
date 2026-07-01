import { logger } from "@queue-forge/logger";
import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { ApiError } from "../errors/api.error.js";

export const errorHandler: ErrorRequestHandler = (error: unknown, req, res, next) => {
  void next;

  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: error.flatten(),
      },
    });
    return;
  }

  if (error instanceof ApiError) {
    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
      },
    });
    return;
  }

  logger.error(
    {
      error,
      method: req.method,
      path: req.path,
    },
    "Unhandled API error",
  );

  res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred",
    },
  });
};
