import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Principal, UserRole } from "@/domain/models";
import type { DemoIdentity, ThreadlineRepositoryPort } from "@/domain/ports/repository";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  getServerDependencies: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("./container", () => ({ getServerDependencies: mocks.getServerDependencies }));

import { SESSION_COOKIE, switchDemoRole } from "./auth";

const expiresAt = new Date("2026-07-19T12:00:00.000Z");
const identities: DemoIdentity[] = [
  {
    workspaceId: "workspace-1",
    userId: "patient-1",
    role: "patient",
    displayName: "Maya Chen",
    expiresAt,
  },
  {
    workspaceId: "workspace-1",
    userId: "clinician-1",
    role: "clinician",
    displayName: "Dr. Rowan Ellis",
    expiresAt,
  },
];

function identityFor(role: UserRole): DemoIdentity {
  return identities.find((identity) => identity.role === role)!;
}

function createCookieStore(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    get: vi.fn((name: string) => {
      const value = values.get(name);
      return value === undefined ? undefined : { name, value };
    }),
    set: vi.fn((name: string, value: string) => {
      values.set(name, value);
    }),
    delete: vi.fn((name: string) => {
      values.delete(name);
    }),
  };
}

function createRepository(overrides: Partial<ThreadlineRepositoryPort> = {}) {
  return {
    consumeRateLimit: vi.fn(() => ({ allowed: true, retryAfterMs: 0 })),
    createWorkspace: vi.fn(() => identities),
    findWorkspaceIdentity: vi.fn((_workspaceId: string, role: UserRole) => identityFor(role)),
    findPrincipalByTokenHash: vi.fn(() => null),
    revokeAuthSession: vi.fn(),
    createAuthSession: vi.fn(() => "new-auth-session"),
    ...overrides,
  } as unknown as ThreadlineRepositoryPort;
}

describe("demo workspace rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throttles only new workspace creation with a stable retryable 429", async () => {
    const cookieStore = createCookieStore();
    const repository = createRepository({
      consumeRateLimit: vi.fn(() => ({ allowed: false, retryAfterMs: 3_001 })),
    });
    mocks.cookies.mockResolvedValue(cookieStore);
    mocks.getServerDependencies.mockReturnValue({ repository });

    await expect(switchDemoRole("patient", "shared-ip-hash")).rejects.toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
      message: "Too many demo workspaces have been created. Try again later.",
      details: { retryAfterSeconds: 4 },
    });
    expect(repository.consumeRateLimit).toHaveBeenCalledWith(
      "workspace-create:shared-ip-hash",
      5,
      3_600_000,
    );
    expect(repository.createWorkspace).not.toHaveBeenCalled();
    expect(repository.createAuthSession).not.toHaveBeenCalled();
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("charges the creation bucket once when a browser has no reusable workspace", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T12:00:00.000Z"));
    const cookieStore = createCookieStore();
    const repository = createRepository();
    mocks.cookies.mockResolvedValue(cookieStore);
    mocks.getServerDependencies.mockReturnValue({ repository });

    const result = await switchDemoRole("patient", "shared-ip-hash");

    expect(result.principal).toMatchObject({
      workspaceId: "workspace-1",
      userId: "patient-1",
      role: "patient",
    });
    expect(repository.consumeRateLimit).toHaveBeenCalledOnce();
    expect(repository.createWorkspace).toHaveBeenCalledOnce();
    expect(repository.createAuthSession).toHaveBeenCalledOnce();
    expect(cookieStore.set).toHaveBeenCalledTimes(2);
  });

  it("allows an explicit non-production limit for isolated browser suites", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("TEST_WORKSPACE_CREATION_LIMIT", "100");
    const cookieStore = createCookieStore();
    const repository = createRepository();
    mocks.cookies.mockResolvedValue(cookieStore);
    mocks.getServerDependencies.mockReturnValue({ repository });

    await switchDemoRole("patient", "shared-ip-hash");

    expect(repository.consumeRateLimit).toHaveBeenCalledWith(
      "workspace-create:shared-ip-hash",
      100,
      3_600_000,
    );
  });

  it("ignores the browser-suite limit override in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TEST_WORKSPACE_CREATION_LIMIT", "100");
    vi.stubEnv("SESSION_SECRET", "unit-prod-session-9f2c7a4e1b8d6f3c5a0e");
    vi.stubEnv("CLEANUP_SECRET", "unit-prod-cleanup-4d8a1f7c9e2b6a5f3c0d");
    const cookieStore = createCookieStore();
    const repository = createRepository();
    mocks.cookies.mockResolvedValue(cookieStore);
    mocks.getServerDependencies.mockReturnValue({ repository });

    await switchDemoRole("patient", "shared-ip-hash");

    expect(repository.consumeRateLimit).toHaveBeenCalledWith(
      "workspace-create:shared-ip-hash",
      5,
      3_600_000,
    );
  });

  it("does not charge workspace creation quota when switching role in the current workspace", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T12:00:00.000Z"));
    const current: Principal = {
      sessionId: "current-auth-session",
      workspaceId: "workspace-1",
      userId: "patient-1",
      role: "patient",
      displayName: "Maya Chen",
      expiresAt,
    };
    const cookieStore = createCookieStore({ [SESSION_COOKIE]: "current-token" });
    const repository = createRepository({
      findPrincipalByTokenHash: vi.fn(() => current),
    });
    mocks.cookies.mockResolvedValue(cookieStore);
    mocks.getServerDependencies.mockReturnValue({ repository });

    const result = await switchDemoRole("clinician", "shared-ip-hash");

    expect(result.principal).toMatchObject({
      workspaceId: "workspace-1",
      userId: "clinician-1",
      role: "clinician",
    });
    expect(repository.consumeRateLimit).not.toHaveBeenCalled();
    expect(repository.createWorkspace).not.toHaveBeenCalled();
    expect(repository.revokeAuthSession).toHaveBeenCalledWith("current-auth-session");
    expect(repository.findWorkspaceIdentity).toHaveBeenCalledWith("workspace-1", "clinician");
  });
});
