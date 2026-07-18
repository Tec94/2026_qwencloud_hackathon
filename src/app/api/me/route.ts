import { requirePrincipal } from "@/lib/server/auth";
import { getServerDependencies } from "@/lib/server/container";
import { jsonData, routeResponse } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return routeResponse(request, async () => {
    const principal = await requirePrincipal();
    const counterpartRole = principal.role === "patient" ? "clinician" : "patient";
    const counterpart = getServerDependencies().repository.findWorkspaceIdentity(
      principal.workspaceId,
      counterpartRole,
    );
    return jsonData({
      user: { id: principal.userId, role: principal.role, displayName: principal.displayName },
      counterpart: counterpart
        ? { id: counterpart.userId, role: counterpart.role, displayName: counterpart.displayName }
        : null,
      workspace: { id: principal.workspaceId, expiresAt: counterpart?.expiresAt.toISOString() ?? null },
      sessionExpiresAt: principal.expiresAt.toISOString(),
    });
  });
}
