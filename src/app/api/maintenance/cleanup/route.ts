import { timingSafeEqual } from "node:crypto";
import { AppError } from "@/domain/errors";
import { getServerDependencies } from "@/lib/server/container";
import { jsonData, routeResponse } from "@/lib/server/http";
import { getValidatedCleanupSecret } from "@/lib/server/runtime-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const expected = getValidatedCleanupSecret();
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected) return false;
  const suppliedBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);
  if (suppliedBytes.length !== expectedBytes.length) return false;
  return timingSafeEqual(suppliedBytes, expectedBytes);
}

export async function POST(request: Request) {
  return routeResponse(request, async () => {
    if (!authorized(request)) {
      throw new AppError("UNAUTHENTICATED", "A valid maintenance credential is required.", 401);
    }
    return jsonData({ cleaned: getServerDependencies().repository.cleanupExpired() });
  });
}
