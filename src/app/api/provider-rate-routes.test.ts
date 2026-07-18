import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "@/domain/errors";
import type { Principal } from "@/domain/models";
import { privacyHash } from "@/lib/server/crypto";

const mocks = vi.hoisted(() => ({
  assertTrustedOrigin: vi.fn(),
  requirePrincipal: vi.fn(),
  switchDemoRole: vi.fn(),
  getServerDependencies: vi.fn(),
  finalizeSession: vi.fn(),
  updateMemory: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/origin", () => ({ assertTrustedOrigin: mocks.assertTrustedOrigin }));
vi.mock("@/lib/server/auth", () => ({
  requirePrincipal: mocks.requirePrincipal,
  switchDemoRole: mocks.switchDemoRole,
}));
vi.mock("@/lib/server/container", () => ({
  getServerDependencies: mocks.getServerDependencies,
}));

import { POST as enterDemo } from "./auth/demo/route";
import { PATCH as editMemory } from "./memories/[id]/route";
import { POST as finalizeReflection } from "./sessions/[id]/finalize/route";

const principal: Principal = {
  sessionId: "auth-1",
  workspaceId: "workspace-1",
  userId: "patient-1",
  role: "patient",
  displayName: "Maya Chen",
  expiresAt: new Date("2026-07-19T12:00:00.000Z"),
};

function request(path: string, body?: unknown): Request {
  return new Request(`https://threadline.test${path}`, {
    method: body === undefined ? "POST" : path.includes("memories") ? "PATCH" : "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.42, 10.0.0.1",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe("provider-costing route identities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePrincipal.mockResolvedValue(principal);
    mocks.getServerDependencies.mockReturnValue({
      service: {
        finalizeSession: mocks.finalizeSession,
        updateMemory: mocks.updateMemory,
      },
    });
  });

  it("forwards the IP hash to new-workspace entry without exposing the raw address", async () => {
    mocks.switchDemoRole.mockResolvedValue({
      principal,
      counterpart: { id: "clinician-1", role: "clinician", displayName: "Dr. Rowan Ellis" },
      workspaceExpiresAt: new Date("2026-07-19T12:00:00.000Z"),
    });

    const response = await enterDemo(request("/api/auth/demo", { role: "patient" }));

    expect(response.status).toBe(200);
    expect(mocks.switchDemoRole).toHaveBeenCalledWith(
      "patient",
      privacyHash("203.0.113.42"),
    );
    expect(JSON.stringify(mocks.switchDemoRole.mock.calls)).not.toContain("203.0.113.42");
  });

  it("forwards the same IP hash to finalization and preserves stable 429 metadata", async () => {
    mocks.finalizeSession.mockRejectedValue(
      new AppError(
        "RATE_LIMITED",
        "The demo AI request limit has been reached. Try again later.",
        429,
        { retryAfterSeconds: 7 },
      ),
    );
    const apiRequest = request("/api/sessions/session-1/finalize");

    const response = await finalizeReflection(apiRequest, {
      params: Promise.resolve({ id: "session-1" }),
    });

    expect(mocks.finalizeSession).toHaveBeenCalledWith(
      principal,
      "session-1",
      privacyHash("203.0.113.42"),
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("7");
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "RATE_LIMITED",
        message: "The demo AI request limit has been reached. Try again later.",
        requestId: expect.any(String),
      },
    });
  });

  it("forwards the IP hash for statement re-embedding", async () => {
    const memory = { id: "memory-1", statement: "A revised memory.", importance: 4 };
    mocks.updateMemory.mockResolvedValue(memory);
    const apiRequest = request("/api/memories/memory-1", {
      statement: "A revised memory.",
      importance: 4,
    });

    const response = await editMemory(apiRequest, {
      params: Promise.resolve({ id: "memory-1" }),
    });

    expect(response.status).toBe(200);
    expect(mocks.updateMemory).toHaveBeenCalledWith(
      principal,
      "memory-1",
      { statement: "A revised memory.", importance: 4 },
      privacyHash("203.0.113.42"),
    );
  });
});
