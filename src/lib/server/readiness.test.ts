import { describe, expect, it, vi } from "vitest";
import { inspectReadiness } from "./readiness";

const environment: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  CI: "false",
  QWEN_API_KEY: "readiness-qwen-key",
  SESSION_SECRET: "readiness-session-secret-with-32-characters",
  CLEANUP_SECRET: "readiness-cleanup-secret-with-32-characters",
  APP_URL: "https://threadline.example.com",
  DATABASE_URL: "file:/data/threadline.db",
};

describe("readiness inspection", () => {
  it("is ready only when configuration, database, and live Qwen all pass", () => {
    expect(inspectReadiness({
      databaseHealthy: () => true,
      qwenMode: () => "live",
    }, environment)).toEqual({
      ready: true,
      checks: { database: true, configuration: true, qwen: true },
    });
  });

  it("rejects deterministic Qwen and invalid production configuration", () => {
    const snapshot = inspectReadiness({
      databaseHealthy: () => true,
      qwenMode: () => "deterministic",
    }, { ...environment, QWEN_API_KEY: "" });

    expect(snapshot).toEqual({
      ready: false,
      checks: { database: true, configuration: false, qwen: false },
    });
  });

  it("fails closed when a readiness probe throws", () => {
    const snapshot = inspectReadiness({
      databaseHealthy: vi.fn(() => { throw new Error("database details"); }),
      qwenMode: vi.fn(() => { throw new Error("provider details"); }),
    }, environment);

    expect(snapshot).toEqual({
      ready: false,
      checks: { database: false, configuration: true, qwen: false },
    });
    expect(JSON.stringify(snapshot)).not.toContain("details");
  });

  it("never serializes configuration values", () => {
    const serialized = JSON.stringify(inspectReadiness({
      databaseHealthy: () => false,
      qwenMode: () => "live",
    }, environment));

    expect(serialized).not.toContain(environment.QWEN_API_KEY);
    expect(serialized).not.toContain(environment.SESSION_SECRET);
    expect(serialized).not.toContain(environment.CLEANUP_SECRET);
    expect(serialized).not.toContain(environment.DATABASE_URL);
  });
});
