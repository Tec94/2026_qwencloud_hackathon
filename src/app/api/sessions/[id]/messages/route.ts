import { z } from "zod";
import { asAppError } from "@/domain/errors";
import { requirePrincipal } from "@/lib/server/auth";
import { getServerDependencies } from "@/lib/server/container";
import { ndjsonLine, parseJson, requestRateIdentity, routeResponse } from "@/lib/server/http";
import { assertTrustedOrigin } from "@/lib/server/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ content: z.string().trim().min(1).max(4_000) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return routeResponse(request, async (requestId) => {
    assertTrustedOrigin(request);
    const [{ id }, principal, body] = await Promise.all([
      params,
      requirePrincipal(),
      parseJson(request, bodySchema),
    ]);
    const service = getServerDependencies().service;
    service.getSession(principal, id);
    const events = service.sendMessage({
      principal,
      sessionId: id,
      content: body.content,
      rateLimitIdentity: requestRateIdentity(request),
      signal: request.signal,
    });
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const event of events) controller.enqueue(ndjsonLine(event));
        } catch (error) {
          const appError = asAppError(error);
          controller.enqueue(
            ndjsonLine({
              type: "error",
              error: { code: appError.code, message: appError.message, requestId },
            }),
          );
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  });
}
