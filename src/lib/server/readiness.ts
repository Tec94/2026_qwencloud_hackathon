import type { QwenPort } from "@/domain/ports/qwen";
import { inspectProductionConfig, type RuntimeEnvironment } from "./runtime-config";

export interface ReadinessChecks {
  database: boolean;
  configuration: boolean;
  qwen: boolean;
}

export interface ReadinessSnapshot {
  ready: boolean;
  checks: ReadinessChecks;
}

export interface ReadinessProbes {
  databaseHealthy: () => boolean;
  qwenMode: () => QwenPort["mode"];
}

function safelyProbe(probe: () => boolean): boolean {
  try {
    return probe();
  } catch {
    return false;
  }
}

export function inspectReadiness(
  probes: ReadinessProbes,
  environment: RuntimeEnvironment = process.env,
): ReadinessSnapshot {
  const checks: ReadinessChecks = {
    database: safelyProbe(probes.databaseHealthy),
    configuration: inspectProductionConfig(environment).valid,
    qwen: safelyProbe(() => probes.qwenMode() === "live"),
  };
  return {
    ready: checks.database && checks.configuration && checks.qwen,
    checks,
  };
}
