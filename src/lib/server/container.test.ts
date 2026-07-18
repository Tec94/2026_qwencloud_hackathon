import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const constructors = vi.hoisted(() => ({
  repository: vi.fn(),
  qwen: vi.fn(() => ({ mode: "live" as const })),
  service: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/infrastructure/database/threadline-repository", () => ({
  ThreadlineRepository: class MockThreadlineRepository {
    constructor() {
      constructors.repository();
    }
  },
}));
vi.mock("@/infrastructure/qwen/factory", () => ({
  createQwenAdapter: constructors.qwen,
}));
vi.mock("@/application/threadline-service", () => ({
  ThreadlineService: class MockThreadlineService {
    constructor(...dependencies: unknown[]) {
      constructors.service(...dependencies);
    }
  },
}));

import { getServerDependencies } from "./container";

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("CI", "false");
  vi.stubEnv("QWEN_API_KEY", "container-qwen-key");
  vi.stubEnv("SESSION_SECRET", "container-session-secret-with-32-characters");
  vi.stubEnv("CLEANUP_SECRET", "container-cleanup-secret-with-32-characters");
  vi.stubEnv("APP_URL", "https://threadline.example.com");
  vi.stubEnv("DATABASE_URL", "file:/data/threadline.db");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("server dependency container", () => {
  it("constructs dependencies after complete production validation", () => {
    expect(getServerDependencies()).toEqual(expect.objectContaining({
      repository: expect.any(Object),
      qwen: expect.objectContaining({ mode: "live" }),
      service: expect.any(Object),
    }));
    expect(constructors.repository).toHaveBeenCalledOnce();
    expect(constructors.qwen).toHaveBeenCalledOnce();
    expect(constructors.service).toHaveBeenCalledOnce();
  });

  it("fails before constructing dependencies when any production value is unsafe", () => {
    vi.stubEnv("CLEANUP_SECRET", "replace-with-a-separate-random-secret");

    expect(() => getServerDependencies()).toThrow(
      "Threadline production configuration is invalid.",
    );
    expect(constructors.repository).not.toHaveBeenCalled();
    expect(constructors.qwen).not.toHaveBeenCalled();
    expect(constructors.service).not.toHaveBeenCalled();
  });

  it("preserves deterministic dependency construction for test and CI environments", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("QWEN_API_KEY", "");
    vi.stubEnv("SESSION_SECRET", "");
    vi.stubEnv("CLEANUP_SECRET", "");

    expect(() => getServerDependencies()).not.toThrow();
    expect(constructors.qwen).toHaveBeenCalledOnce();
  });
});
