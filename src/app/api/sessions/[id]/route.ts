import { requirePrincipal } from "@/lib/server/auth";
import { getServerDependencies } from "@/lib/server/container";
import { jsonData, routeResponse } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return routeResponse(request, async () => {
    const [{ id }, principal] = await Promise.all([params, requirePrincipal()]);
    const service = getServerDependencies().service;
    return jsonData({
      session: service.getSession(principal, id),
      summary: getServerDependencies().repository.getSessionSummary(principal, id),
    });
  });
}
