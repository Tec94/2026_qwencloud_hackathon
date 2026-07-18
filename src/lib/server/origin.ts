import "server-only";
import { AppError } from "@/domain/errors";
import { getAppUrlForRuntime } from "./runtime-config";

export function assertTrustedOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) {
    if (process.env.NODE_ENV === "production") {
      throw new AppError("ORIGIN_NOT_ALLOWED", "This request did not include a trusted origin.", 403);
    }
    return;
  }
  const allowed = new Set([new URL(request.url).origin]);
  const appUrl = getAppUrlForRuntime();
  if (appUrl) allowed.add(appUrl.origin);
  if (!allowed.has(origin)) {
    throw new AppError("ORIGIN_NOT_ALLOWED", "This request came from an untrusted origin.", 403);
  }
}
