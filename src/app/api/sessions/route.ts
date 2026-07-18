import { requirePrincipal } from "@/lib/server/auth";
import { getServerDependencies } from "@/lib/server/container";
import { jsonData, routeResponse } from "@/lib/server/http";
import { assertTrustedOrigin } from "@/lib/server/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return routeResponse(request, async () => {
    const principal = await requirePrincipal();
    return jsonData({ sessions: getServerDependencies().service.listSessions(principal) });
  });
}

export async function POST(request: Request) {
  return routeResponse(request, async () => {
    assertTrustedOrigin(request);
    const principal = await requirePrincipal();
    const session = getServerDependencies().service.createSession(principal);
    return jsonData({ session }, { status: 201 });
  });
}
