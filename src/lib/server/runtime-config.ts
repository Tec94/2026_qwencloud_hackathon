import "server-only";

const MIN_SECRET_LENGTH = 32;
const DEVELOPMENT_SESSION_SECRET = "threadline-local-development-secret-2026";

export type ProductionConfigField =
  | "QWEN_API_KEY"
  | "SESSION_SECRET"
  | "CLEANUP_SECRET"
  | "APP_URL"
  | "DATABASE_URL";

export type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;

export type ProductionConfigIssueCode =
  | "missing"
  | "placeholder"
  | "too_short"
  | "invalid"
  | "must_differ";

export interface ProductionConfigIssue {
  field: ProductionConfigField;
  code: ProductionConfigIssueCode;
}

export interface ProductionConfig {
  qwenApiKey: string;
  sessionSecret: string;
  cleanupSecret: string;
  appUrl: string;
  databaseUrl: string;
}

export type ProductionConfigInspection =
  | { valid: true; config: ProductionConfig; issues: [] }
  | { valid: false; config: null; issues: ProductionConfigIssue[] };

const PLACEHOLDER_VALUES: Readonly<Partial<Record<ProductionConfigField, ReadonlySet<string>>>> = {
  QWEN_API_KEY: new Set([
    "replace-with-your-qwen-api-key",
    "your-qwen-api-key",
    "changeme",
  ]),
  SESSION_SECRET: new Set(["replace-with-at-least-32-random-characters"]),
  CLEANUP_SECRET: new Set(["replace-with-a-separate-random-secret"]),
  APP_URL: new Set(["http://localhost:3000"]),
};

export class RuntimeConfigurationError extends Error {
  constructor(public readonly issues: ProductionConfigIssue[]) {
    super("Threadline production configuration is invalid.");
    this.name = "RuntimeConfigurationError";
  }
}

function valueOf(environment: RuntimeEnvironment, field: ProductionConfigField): string {
  return environment[field]?.trim() ?? "";
}

function isPlaceholder(field: ProductionConfigField, value: string): boolean {
  return PLACEHOLDER_VALUES[field]?.has(value.toLowerCase()) ?? false;
}

function requiredIssue(
  field: ProductionConfigField,
  value: string,
): ProductionConfigIssue | null {
  if (!value) return { field, code: "missing" };
  if (isPlaceholder(field, value)) return { field, code: "placeholder" };
  return null;
}

function secretIssue(
  field: "SESSION_SECRET" | "CLEANUP_SECRET",
  value: string,
): ProductionConfigIssue | null {
  const required = requiredIssue(field, value);
  if (required) return required;
  if (value.length < MIN_SECRET_LENGTH) return { field, code: "too_short" };
  return null;
}

function appUrlIssue(
  value: string,
  environment: RuntimeEnvironment,
): ProductionConfigIssue | null {
  if (!value) return { field: "APP_URL", code: "missing" };
  try {
    const url = new URL(value);
    const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    const explicitlyAllowedLocalHttp =
      environment.ALLOW_INSECURE_LOCAL === "true" && url.protocol === "http:" && loopback;
    if (isPlaceholder("APP_URL", value) && !explicitlyAllowedLocalHttp) {
      return { field: "APP_URL", code: "placeholder" };
    }
    if (url.username || url.password || (!explicitlyAllowedLocalHttp && url.protocol !== "https:")) {
      return { field: "APP_URL", code: "invalid" };
    }
    if (!explicitlyAllowedLocalHttp && loopback) {
      return { field: "APP_URL", code: "invalid" };
    }
  } catch {
    return { field: "APP_URL", code: "invalid" };
  }
  return null;
}

function databaseUrlIssue(value: string): ProductionConfigIssue | null {
  const required = requiredIssue("DATABASE_URL", value);
  if (required) return required;
  if (!value.startsWith("file:")) return { field: "DATABASE_URL", code: "invalid" };
  const filename = value.slice("file:".length);
  const absoluteFile = filename.startsWith("/") || /^[a-z]:[\\/]/i.test(filename);
  if (!filename || filename === ":memory:" || !absoluteFile) {
    return { field: "DATABASE_URL", code: "invalid" };
  }
  return null;
}

function qwenApiKeyIssue(value: string): ProductionConfigIssue | null {
  return requiredIssue("QWEN_API_KEY", value);
}

export function inspectProductionConfig(
  environment: RuntimeEnvironment = process.env,
): ProductionConfigInspection {
  const qwenApiKey = valueOf(environment, "QWEN_API_KEY");
  const sessionSecret = valueOf(environment, "SESSION_SECRET");
  const cleanupSecret = valueOf(environment, "CLEANUP_SECRET");
  const appUrl = valueOf(environment, "APP_URL");
  const databaseUrl = valueOf(environment, "DATABASE_URL");
  const issues = [
    qwenApiKeyIssue(qwenApiKey),
    secretIssue("SESSION_SECRET", sessionSecret),
    secretIssue("CLEANUP_SECRET", cleanupSecret),
    appUrlIssue(appUrl, environment),
    databaseUrlIssue(databaseUrl),
  ].filter((issue): issue is ProductionConfigIssue => issue !== null);

  if (sessionSecret && cleanupSecret && sessionSecret === cleanupSecret) {
    issues.push({ field: "CLEANUP_SECRET", code: "must_differ" });
  }

  if (issues.length > 0) return { valid: false, config: null, issues };
  return {
    valid: true,
    config: { qwenApiKey, sessionSecret, cleanupSecret, appUrl, databaseUrl },
    issues: [],
  };
}

export function requireProductionConfig(
  environment: RuntimeEnvironment = process.env,
): ProductionConfig {
  const inspection = inspectProductionConfig(environment);
  if (!inspection.valid) throw new RuntimeConfigurationError(inspection.issues);
  return inspection.config;
}

export function isStrictProductionRuntime(environment: RuntimeEnvironment = process.env): boolean {
  return environment.NODE_ENV === "production" && environment.CI !== "true";
}

export function getValidatedQwenApiKey(
  environment: RuntimeEnvironment = process.env,
): string | null {
  const value = valueOf(environment, "QWEN_API_KEY");
  return qwenApiKeyIssue(value) ? null : value;
}

export function getSessionSecretForRuntime(
  environment: RuntimeEnvironment = process.env,
): string {
  const value = valueOf(environment, "SESSION_SECRET");
  const cleanupSecret = valueOf(environment, "CLEANUP_SECRET");
  const issue = secretIssue("SESSION_SECRET", value);
  const equalIssue = value && cleanupSecret && value === cleanupSecret
    ? ({ field: "SESSION_SECRET", code: "must_differ" } satisfies ProductionConfigIssue)
    : null;
  if (!issue && !equalIssue) return value;
  if (isStrictProductionRuntime(environment)) {
    throw new RuntimeConfigurationError([...(issue ? [issue] : []), ...(equalIssue ? [equalIssue] : [])]);
  }
  return DEVELOPMENT_SESSION_SECRET;
}

export function getValidatedCleanupSecret(
  environment: RuntimeEnvironment = process.env,
): string | null {
  const value = valueOf(environment, "CLEANUP_SECRET");
  const sessionSecret = valueOf(environment, "SESSION_SECRET");
  if (secretIssue("CLEANUP_SECRET", value) || (sessionSecret && value === sessionSecret)) {
    return null;
  }
  return value;
}

export function getAppUrlForRuntime(
  environment: RuntimeEnvironment = process.env,
): URL | null {
  const value = valueOf(environment, "APP_URL");
  if (isStrictProductionRuntime(environment)) {
    const issue = appUrlIssue(value, environment);
    if (issue) throw new RuntimeConfigurationError([issue]);
  }
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    throw new RuntimeConfigurationError([{ field: "APP_URL", code: "invalid" }]);
  }
}

export function getDatabaseUrlForRuntime(
  environment: RuntimeEnvironment = process.env,
): string | undefined {
  const value = valueOf(environment, "DATABASE_URL");
  if (isStrictProductionRuntime(environment)) {
    const issue = databaseUrlIssue(value);
    if (issue) throw new RuntimeConfigurationError([issue]);
  }
  return value || undefined;
}
