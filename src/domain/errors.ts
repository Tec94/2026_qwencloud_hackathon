import type { ZodIssue } from "zod";

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "ORIGIN_NOT_ALLOWED"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "SESSION_NOT_ACTIVE"
  | "CONSENT_REQUIRED"
  | "QWEN_UNAVAILABLE"
  | "EXTRACTION_FAILED"
  | "CONFLICT"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AppError";
  }
}

export class ValidationError extends AppError {
  constructor(
    message = "Please check the submitted information.",
    fieldErrors?: Record<string, string[]>,
  ) {
    super("VALIDATION_ERROR", message, 400, fieldErrors ? { fieldErrors } : undefined);
  }
}

export function fieldErrorsFromIssues(issues: ZodIssue[]): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "form";
    (fields[key] ??= []).push(issue.message);
  }
  return fields;
}

export function asAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  return new AppError(
    "INTERNAL_ERROR",
    "Threadline could not complete that request.",
    500,
    undefined,
    error instanceof Error ? { cause: error } : undefined,
  );
}
