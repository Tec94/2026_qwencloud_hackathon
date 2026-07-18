import { z } from "zod";
import { USER_ROLES } from "@/domain/models";
import { switchDemoRole } from "@/lib/server/auth";
import { jsonData, parseJson, requestRateIdentity, routeResponse } from "@/lib/server/http";
import { assertTrustedOrigin } from "@/lib/server/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ role: z.enum(USER_ROLES) });

export async function POST(request: Request) {
  return routeResponse(request, async () => {
    assertTrustedOrigin(request);
    const { role } = await parseJson(request, bodySchema);
    const result = await switchDemoRole(role, requestRateIdentity(request));
    return jsonData({
      user: {
        id: result.principal.userId,
        role: result.principal.role,
        displayName: result.principal.displayName,
      },
      counterpart: result.counterpart,
      workspace: {
        id: result.principal.workspaceId,
        expiresAt: result.workspaceExpiresAt.toISOString(),
      },
      sessionExpiresAt: result.principal.expiresAt.toISOString(),
    });
  });
}
