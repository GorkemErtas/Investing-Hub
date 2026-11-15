import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "./errors.js";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "INVALID_REQUEST",
        message:
          "Invalid request fields, symbol, interval or query parameters.",
      },
    });
    return;
  }
  if (err instanceof AppError) {
    res
      .status(err.status)
      .json({ error: { code: err.code, message: err.message } });
    return;
  }
  if (
    err &&
    typeof err === "object" &&
    "type" in err &&
    ["entity.parse.failed", "entity.too.large"].includes(String(err.type))
  ) {
    res.status(err.type === "entity.too.large" ? 413 : 400).json({
      error: {
        code: "INVALID_BODY",
        message: "JSON body is invalid or too large.",
      },
    });
    return;
  }
  if (
    err &&
    typeof err === "object" &&
    "name" in err &&
    /^(Mongo|Mongoose)/.test(String(err.name))
  ) {
    res.status(503).json({
      error: {
        code: "ACCOUNTS_UNAVAILABLE",
        message: "Account storage is unavailable. Please retry later.",
      },
    });
    return;
  }
  // Do not serialize provider responses, request data or exception strings.
  console.error(
    JSON.stringify({
      event: "request_failed",
      method: _req.method,
      code: "INTERNAL_ERROR",
    }),
  );
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred.",
    },
  });
};
