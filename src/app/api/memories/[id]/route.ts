import { z } from "zod";
import { requirePrincipal } from "@/lib/server/auth";
import { getServerDependencies } from "@/lib/server/container";
import { jsonData, parseJson, requestRateIdentity, routeResponse } from "@/lib/server/http";
import { assertTrustedOrigin } from "@/lib/server/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    statement: z.string().trim().min(4).max(600).optional(),
    importance: z.number().int().min(1).max(5).optional(),
  })
  .refine((value) => value.statement !== undefined || value.importance !== undefined, {
    message: "Provide a statement or importance value.",
  });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return routeResponse(request, async () => {
    assertTrustedOrigin(request);
    const [{ id }, principal, changes] = await Promise.all([
      params,
      requirePrincipal(),
      parseJson(request, bodySchema),
    ]);
    const memory = await getServerDependencies().service.updateMemory(
      principal,
      id,
      changes,
      requestRateIdentity(request),
    );
    return jsonData({ memory });
  });
}
