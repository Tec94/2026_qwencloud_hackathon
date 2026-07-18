import { requirePrincipal } from "@/lib/server/auth";
import { getServerDependencies } from "@/lib/server/container";
import { jsonData, requestRateIdentity, routeResponse } from "@/lib/server/http";
import { assertTrustedOrigin } from "@/lib/server/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return routeResponse(request, async () => {
    assertTrustedOrigin(request);
    const [{ id }, principal] = await Promise.all([params, requirePrincipal()]);
    return jsonData(
      await getServerDependencies().service.finalizeSession(
        principal,
        id,
        requestRateIdentity(request),
      ),
    );
  });
}
