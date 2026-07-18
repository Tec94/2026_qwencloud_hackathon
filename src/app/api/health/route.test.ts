import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const probes = vi.hoisted(() => ({
  databaseHealthy: vi.fn<() => boolean>(),
  qwenMode: vi.fn<() => "live" | "deterministic">(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/infrastructure/database/threadline-repository", () => ({
  ThreadlineRepository: class MockThreadlineRepository {
    isHealthy() {
      return probes.databaseHealthy();
    }
  },
}));
vi.mock("@/infrastructure/qwen/factory", () => ({
  createQwenAdapter: () => ({ mode: probes.qwenMode() }),
}));

import { GET } from "./route";

const QWEN_API_KEY = "health-qwen-key";
const SESSION_SECRET = "health-session-secret-with-more-than-32-characters";
const CLEANUP_SECRET = "health-cleanup-secret-with-more-than-32-characters";

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("CI", "false");
  vi.stubEnv("QWEN_API_KEY", QWEN_API_KEY);
  vi.stubEnv("SESSION_SECRET", SESSION_SECRET);
  vi.stubEnv("CLEANUP_SECRET", CLEANUP_SECRET);
  vi.stubEnv("APP_URL", "https://threadline.example.com");
  vi.stubEnv("DATABASE_URL", "file:/data/threadline.db");
  probes.databaseHealthy.mockReturnValue(true);
  probes.qwenMode.mockReturnValue("live");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/health", () => {
  it("returns 200 only when every readiness check passes", async () => {
    const response = await GET(new Request("https://threadline.example.com/api/health"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: {
        status: "ok",
        checks: { database: true, configuration: true, qwen: true },
      },
    });
  });

  it("returns 503 for invalid production configuration without leaking values", async () => {
    vi.stubEnv("SESSION_SECRET", "short-secret");

    const response = await GET(new Request("https://threadline.example.com/api/health"));
    const body = JSON.stringify(await response.json());

    expect(response.status).toBe(503);
    expect(JSON.parse(body)).toEqual({
      data: {
        status: "not_ready",
        checks: { database: true, configuration: false, qwen: true },
      },
    });
    expect(body).not.toContain("short-secret");
    expect(body).not.toContain(QWEN_API_KEY);
    expect(body).not.toContain(CLEANUP_SECRET);
  });

  it("returns 503 for an unhealthy database or non-live Qwen", async () => {
    probes.databaseHealthy.mockReturnValue(false);
    probes.qwenMode.mockReturnValue("deterministic");

    const response = await GET(new Request("https://threadline.example.com/api/health"));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      data: {
        status: "not_ready",
        checks: { database: false, configuration: true, qwen: false },
      },
    });
  });

  it("converts probe exceptions into failed readiness checks", async () => {
    probes.databaseHealthy.mockImplementation(() => { throw new Error("database secret detail"); });
    probes.qwenMode.mockImplementation(() => { throw new Error("provider secret detail"); });

    const response = await GET(new Request("https://threadline.example.com/api/health"));
    const body = JSON.stringify(await response.json());

    expect(response.status).toBe(503);
    expect(body).not.toContain("secret detail");
    expect(JSON.parse(body).data.checks).toEqual({
      database: false,
      configuration: true,
      qwen: false,
    });
  });
});
