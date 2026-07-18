import "server-only";
import { z } from "zod";
import { AppError, asAppError, fieldErrorsFromIssues } from "@/domain/errors";
import { privacyHash } from "./crypto";

export const MAX_JSON_BODY_BYTES = 16 * 1_024;

export function jsonData<T>(data: T, init?: ResponseInit): Response {
  return Response.json({ data }, init);
}

export async function parseJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let value: unknown;
  try {
    const declaredLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BODY_BYTES) {
      throw new AppError(
        "PAYLOAD_TOO_LARGE",
        "The request body exceeds the 16 KB limit.",
        413,
      );
    }

    if (!request.body) throw new SyntaxError("Missing JSON body.");
    const reader = request.body.getReader();
    const decoder = new TextDecoder();
    let bytesRead = 0;
    let body = "";
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      bytesRead += chunk.byteLength;
      if (bytesRead > MAX_JSON_BODY_BYTES) {
        await reader.cancel();
        throw new AppError(
          "PAYLOAD_TOO_LARGE",
          "The request body exceeds the 16 KB limit.",
          413,
        );
      }
      body += decoder.decode(chunk, { stream: true });
    }
    body += decoder.decode();
    value = JSON.parse(body);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("VALIDATION_ERROR", "The request body must be valid JSON.", 400);
  }
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError("VALIDATION_ERROR", "Please check the submitted information.", 400, {
      fieldErrors: fieldErrorsFromIssues(result.error.issues),
    });
  }
  return result.data;
}

export async function routeResponse(
  request: Request,
  handler: (requestId: string) => Promise<Response>,
): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    return await handler(requestId);
  } catch (error) {
    const appError = error instanceof z.ZodError
      ? new AppError("VALIDATION_ERROR", "Please check the submitted information.", 400, {
          fieldErrors: fieldErrorsFromIssues(error.issues),
        })
      : asAppError(error);
    if (appError.status >= 500) {
      console.error(
        JSON.stringify({
          event: "request_failed",
          requestId,
          code: appError.code,
          status: appError.status,
          path: new URL(request.url).pathname,
        }),
      );
    }
    const fieldErrors = appError.details?.fieldErrors;
    return Response.json(
      {
        error: {
          code: appError.code,
          message: appError.message,
          ...(fieldErrors ? { fieldErrors } : {}),
          requestId,
        },
      },
      {
        status: appError.status,
        headers:
          appError.code === "RATE_LIMITED" && appError.details?.retryAfterSeconds
            ? { "Retry-After": String(appError.details.retryAfterSeconds) }
            : undefined,
      },
    );
  }
}

export function requestRateIdentity(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const value = forwarded || request.headers.get("x-real-ip") || "local";
  return privacyHash(value);
}

export function ndjsonLine(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value)}\n`);
}
