import { describe, expect, it } from "vitest";

import { vi } from "vitest";

vi.mock("server-only", () => ({}));
import {
  getAppUrlForRuntime,
  getDatabaseUrlForRuntime,
  getSessionSecretForRuntime,
  getValidatedCleanupSecret,
  getValidatedQwenApiKey,
  inspectProductionConfig,
  isStrictProductionRuntime,
  requireProductionConfig,
  type RuntimeEnvironment,
  RuntimeConfigurationError,
} from "./runtime-config";

const SESSION_SECRET = "session-secret-that-is-longer-than-32-characters";
const CLEANUP_SECRET = "cleanup-secret-that-is-longer-than-32-characters";

function validEnvironment(overrides: RuntimeEnvironment = {}): RuntimeEnvironment {
  return {
    NODE_ENV: "production",
    CI: "false",
    QWEN_API_KEY: "qwen-live-key",
    SESSION_SECRET,
    CLEANUP_SECRET,
    APP_URL: "https://threadline.example.com",
    DATABASE_URL: "file:/data/threadline.db",
    ...overrides,
  };
}

describe("production runtime configuration", () => {
  it("returns a normalized production configuration when every value is safe", () => {
    const inspection = inspectProductionConfig(validEnvironment({
      QWEN_API_KEY: "  qwen-live-key  ",
      APP_URL: "  https://threadline.example.com  ",
    }));

    expect(inspection).toEqual({
      valid: true,
      config: {
        qwenApiKey: "qwen-live-key",
        sessionSecret: SESSION_SECRET,
        cleanupSecret: CLEANUP_SECRET,
        appUrl: "https://threadline.example.com",
        databaseUrl: "file:/data/threadline.db",
      },
      issues: [],
    });
  });

  it("reports missing values by field without including their contents", () => {
    const inspection = inspectProductionConfig({});

    expect(inspection.valid).toBe(false);
    expect(inspection.issues).toEqual([
      { field: "QWEN_API_KEY", code: "missing" },
      { field: "SESSION_SECRET", code: "missing" },
      { field: "CLEANUP_SECRET", code: "missing" },
      { field: "APP_URL", code: "missing" },
      { field: "DATABASE_URL", code: "missing" },
    ]);
  });

  it("rejects the committed example placeholders", () => {
    const inspection = inspectProductionConfig(validEnvironment({
      QWEN_API_KEY: "replace-with-your-qwen-api-key",
      SESSION_SECRET: "replace-with-at-least-32-random-characters",
      CLEANUP_SECRET: "replace-with-a-separate-random-secret",
      APP_URL: "http://localhost:3000",
    }));

    expect(inspection.valid).toBe(false);
    expect(inspection.issues).toEqual(expect.arrayContaining([
      { field: "QWEN_API_KEY", code: "placeholder" },
      { field: "SESSION_SECRET", code: "placeholder" },
      { field: "CLEANUP_SECRET", code: "placeholder" },
      { field: "APP_URL", code: "placeholder" },
    ]));
  });

  it("rejects short or shared secrets", () => {
    const short = inspectProductionConfig(validEnvironment({
      SESSION_SECRET: "too-short",
      CLEANUP_SECRET: "also-too-short",
    }));
    const equal = inspectProductionConfig(validEnvironment({ CLEANUP_SECRET: SESSION_SECRET }));

    expect(short.issues).toEqual(expect.arrayContaining([
      { field: "SESSION_SECRET", code: "too_short" },
      { field: "CLEANUP_SECRET", code: "too_short" },
    ]));
    expect(equal.issues).toContainEqual({ field: "CLEANUP_SECRET", code: "must_differ" });
  });

  it.each([
    ["APP_URL", "http://threadline.example.com"],
    ["APP_URL", "https://user:password@threadline.example.com"],
    ["APP_URL", "not-a-url"],
    ["DATABASE_URL", "file::memory:"],
    ["DATABASE_URL", "file:./data/threadline.db"],
    ["DATABASE_URL", "postgres://threadline.invalid/db"],
  ] as const)("rejects an unsafe %s", (field, value) => {
    const inspection = inspectProductionConfig(validEnvironment({ [field]: value }));

    expect(inspection.issues).toContainEqual({ field, code: "invalid" });
  });

  it("permits loopback HTTP only through the explicit local-container opt-in", () => {
    expect(inspectProductionConfig(validEnvironment({
      APP_URL: "http://localhost:3000",
      ALLOW_INSECURE_LOCAL: "true",
    })).valid).toBe(true);
    expect(inspectProductionConfig(validEnvironment({
      APP_URL: "http://127.0.0.1:3000",
      ALLOW_INSECURE_LOCAL: "true",
    })).valid).toBe(true);
    expect(inspectProductionConfig(validEnvironment({
      APP_URL: "http://threadline.example.com",
      ALLOW_INSECURE_LOCAL: "true",
    })).issues).toContainEqual({ field: "APP_URL", code: "invalid" });
    expect(inspectProductionConfig(validEnvironment({
      APP_URL: "http://localhost:3000",
      ALLOW_INSECURE_LOCAL: "false",
    })).issues).toContainEqual({ field: "APP_URL", code: "placeholder" });
  });

  it("throws a value-free configuration error from the strict accessor", () => {
    const environment = validEnvironment({ SESSION_SECRET: "sensitive-but-short" });

    expect(() => requireProductionConfig(environment)).toThrow(RuntimeConfigurationError);
    try {
      requireProductionConfig(environment);
    } catch (error) {
      expect(String(error)).not.toContain("sensitive-but-short");
    }
  });

  it("enforces strict production outside CI while preserving test, CI, and development", () => {
    expect(isStrictProductionRuntime(validEnvironment())).toBe(true);
    expect(isStrictProductionRuntime(validEnvironment({ CI: "true" }))).toBe(false);
    expect(isStrictProductionRuntime(validEnvironment({ NODE_ENV: "test" }))).toBe(false);
    expect(isStrictProductionRuntime(validEnvironment({ NODE_ENV: "development" }))).toBe(false);
  });

  it("provides field-specific runtime accessors without weakening production", () => {
    expect(getValidatedQwenApiKey(validEnvironment())).toBe("qwen-live-key");
    expect(getValidatedQwenApiKey(validEnvironment({ QWEN_API_KEY: "changeme" }))).toBeNull();
    expect(getValidatedCleanupSecret(validEnvironment())).toBe(CLEANUP_SECRET);
    expect(getValidatedCleanupSecret(validEnvironment({ CLEANUP_SECRET: "short" }))).toBeNull();
    expect(getValidatedCleanupSecret(validEnvironment({ CLEANUP_SECRET: SESSION_SECRET }))).toBeNull();
    expect(getSessionSecretForRuntime(validEnvironment())).toBe(SESSION_SECRET);
    expect(getAppUrlForRuntime(validEnvironment())?.origin).toBe("https://threadline.example.com");
    expect(getDatabaseUrlForRuntime(validEnvironment())).toBe("file:/data/threadline.db");
  });

  it("uses safe development fallbacks but rejects the same values in production", () => {
    const development = validEnvironment({ NODE_ENV: "development", SESSION_SECRET: "short" });
    const production = validEnvironment({ SESSION_SECRET: "short" });

    expect(getSessionSecretForRuntime(development)).toBe(
      "threadline-local-development-secret-2026",
    );
    expect(() => getSessionSecretForRuntime(production)).toThrow(RuntimeConfigurationError);
    expect(() => getAppUrlForRuntime(validEnvironment({ APP_URL: "http://localhost:3000" })))
      .toThrow(RuntimeConfigurationError);
    expect(() => getDatabaseUrlForRuntime(validEnvironment({ DATABASE_URL: "file::memory:" })))
      .toThrow(RuntimeConfigurationError);
  });
});
