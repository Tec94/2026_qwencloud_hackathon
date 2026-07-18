import "server-only";
import { cookies } from "next/headers";
import { AppError } from "@/domain/errors";
import type { Principal, UserRole } from "@/domain/models";
import { getServerDependencies } from "./container";
import {
  createOpaqueToken,
  createSignedCapability,
  hashOpaqueToken,
  verifySignedCapability,
} from "./crypto";

export const SESSION_COOKIE = "threadline_session";
export const WORKSPACE_COOKIE = "threadline_workspace";

const WORKSPACE_CREATION_LIMIT = 5;
const WORKSPACE_CREATION_WINDOW_MS = 60 * 60 * 1_000;

function workspaceCreationLimit(): number {
  if (process.env.NODE_ENV === "production") return WORKSPACE_CREATION_LIMIT;
  const configured = Number(process.env.TEST_WORKSPACE_CREATION_LIMIT);
  return Number.isSafeInteger(configured) && configured > 0
    ? configured
    : WORKSPACE_CREATION_LIMIT;
}

interface WorkspaceCapability {
  workspaceId: string;
  expiresAt: string;
}

export async function optionalPrincipal(): Promise<Principal | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return getServerDependencies().repository.findPrincipalByTokenHash(hashOpaqueToken(token));
}

export async function requirePrincipal(): Promise<Principal> {
  const principal = await optionalPrincipal();
  if (!principal) throw new AppError("UNAUTHENTICATED", "Choose a demo role to continue.", 401);
  return principal;
}

export async function switchDemoRole(role: UserRole, rateLimitIdentity: string): Promise<{
  principal: Principal;
  counterpart: { id: string; role: UserRole; displayName: string };
  workspaceExpiresAt: Date;
}> {
  const { repository } = getServerDependencies();
  const current = await optionalPrincipal();
  const cookieStore = await cookies();
  const capabilityValue = cookieStore.get(WORKSPACE_COOKIE)?.value;
  const capability = capabilityValue
    ? verifySignedCapability<WorkspaceCapability>(capabilityValue)
    : null;
  const capabilityValid =
    capability &&
    typeof capability.workspaceId === "string" &&
    typeof capability.expiresAt === "string" &&
    new Date(capability.expiresAt).getTime() > Date.now();
  const reusableWorkspaceId = current?.workspaceId ?? (capabilityValid ? capability.workspaceId : null);
  let identities = null;
  if (!reusableWorkspaceId) {
    const limit = repository.consumeRateLimit(
      `workspace-create:${rateLimitIdentity}`,
      workspaceCreationLimit(),
      WORKSPACE_CREATION_WINDOW_MS,
    );
    if (!limit.allowed) {
      throw new AppError(
        "RATE_LIMITED",
        "Too many demo workspaces have been created. Try again later.",
        429,
        { retryAfterSeconds: Math.ceil(limit.retryAfterMs / 1_000) },
      );
    }
    identities = repository.createWorkspace();
  }
  const identity = reusableWorkspaceId
    ? repository.findWorkspaceIdentity(reusableWorkspaceId, role)
    : (identities?.find((candidate) => candidate.role === role) ?? null);
  if (!identity) throw new AppError("NOT_FOUND", "The demo workspace has expired.", 404);
  if (current) repository.revokeAuthSession(current.sessionId);
  const expiresAt = new Date(Math.min(identity.expiresAt.getTime(), Date.now() + 12 * 60 * 60 * 1_000));
  const token = createOpaqueToken();
  const sessionId = repository.createAuthSession(identity, hashOpaqueToken(token), expiresAt);
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
    priority: "high",
  });
  cookieStore.set(
    WORKSPACE_COOKIE,
    createSignedCapability({
      workspaceId: identity.workspaceId,
      expiresAt: identity.expiresAt.toISOString(),
    }),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: identity.expiresAt,
      priority: "high",
    },
  );
  const counterpartRole: UserRole = role === "patient" ? "clinician" : "patient";
  const counterpart = repository.findWorkspaceIdentity(identity.workspaceId, counterpartRole);
  if (!counterpart) throw new Error("Seeded counterpart is missing.");
  return {
    principal: {
      sessionId,
      workspaceId: identity.workspaceId,
      userId: identity.userId,
      role: identity.role,
      displayName: identity.displayName,
      expiresAt,
    },
    counterpart: {
      id: counterpart.userId,
      role: counterpart.role,
      displayName: counterpart.displayName,
    },
    workspaceExpiresAt: identity.expiresAt,
  };
}

export async function clearPrincipal(): Promise<void> {
  const principal = await optionalPrincipal();
  if (principal) getServerDependencies().repository.revokeAuthSession(principal.sessionId);
  (await cookies()).delete(SESSION_COOKIE);
}
