import { clearPrincipal } from "@/lib/server/auth";
import { jsonData, routeResponse } from "@/lib/server/http";
import { assertTrustedOrigin } from "@/lib/server/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return routeResponse(request, async () => {
    assertTrustedOrigin(request);
    await clearPrincipal();
    return jsonData({ loggedOut: true });
  });
}
