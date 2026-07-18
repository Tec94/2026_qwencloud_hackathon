import { ThreadlineRepository } from "@/infrastructure/database/threadline-repository";
import { createQwenAdapter } from "@/infrastructure/qwen/factory";
import { jsonData, routeResponse } from "@/lib/server/http";
import { inspectReadiness } from "@/lib/server/readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return routeResponse(request, async () => {
    const readiness = inspectReadiness({
      databaseHealthy: () => new ThreadlineRepository().isHealthy(),
      qwenMode: () => createQwenAdapter().mode,
    });
    return jsonData({
      status: readiness.ready ? "ok" : "not_ready",
      checks: readiness.checks,
    }, { status: readiness.ready ? 200 : 503 });
  });
}
