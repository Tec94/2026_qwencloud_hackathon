import { requirePrincipal } from "@/lib/server/auth";
import { getServerDependencies } from "@/lib/server/container";
import { jsonData, routeResponse } from "@/lib/server/http";
import { assertTrustedOrigin } from "@/lib/server/origin";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return routeResponse(request, async () => {
    assertTrustedOrigin(request);
    const [{ id }, principal] = await Promise.all([params, requirePrincipal()]);
    return jsonData({ memory: getServerDependencies().repository.transitionMemory(principal, id, "dispute") });
  });
}
