import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  cleanupExpired: vi.fn(() => ({ workspaces: 1, sessions: 2, rateLimits: 3 })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/container", () => ({
  getServerDependencies: () => ({ repository }),
}));

import { POST } from "./route";

const SESSION_SECRET = "maintenance-session-secret-with-32-characters";
const CLEANUP_SECRET = "maintenance-cleanup-secret-with-32-characters";

function request(credential?: string): Request {
  return new Request("https://threadline.example.com/api/maintenance/cleanup", {
    method: "POST",
    headers: credential ? { authorization: `Bearer ${credential}` } : undefined,
  });
}

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", SESSION_SECRET);
  vi.stubEnv("CLEANUP_SECRET", CLEANUP_SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/maintenance/cleanup", () => {
  it("accepts a distinct strong cleanup credential", async () => {
    const response = await POST(request(CLEANUP_SECRET));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { cleaned: { workspaces: 1, sessions: 2, rateLimits: 3 } },
    });
    expect(repository.cleanupExpired).toHaveBeenCalledOnce();
  });

  it.each([
    ["missing", undefined],
    ["incorrect", "wrong-but-still-long-enough-to-look-real"],
    ["short configured secret", "short"],
    ["example placeholder", "replace-with-a-separate-random-secret"],
  ])("rejects a %s credential", async (_label, credential) => {
    if (_label === "short configured secret" || _label === "example placeholder") {
      vi.stubEnv("CLEANUP_SECRET", credential);
    }

    const response = await POST(request(credential));

    expect(response.status).toBe(401);
    expect(repository.cleanupExpired).not.toHaveBeenCalled();
  });

  it("rejects a cleanup secret reused as the session secret", async () => {
    vi.stubEnv("CLEANUP_SECRET", SESSION_SECRET);

    const response = await POST(request(SESSION_SECRET));

    expect(response.status).toBe(401);
    expect(repository.cleanupExpired).not.toHaveBeenCalled();
  });

  it("does not disclose the expected credential on failure", async () => {
    const response = await POST(request("incorrect-credential-with-more-than-32-characters"));
    const body = JSON.stringify(await response.json());

    expect(response.status).toBe(401);
    expect(body).not.toContain(CLEANUP_SECRET);
    expect(body).not.toContain(SESSION_SECRET);
  });
});
