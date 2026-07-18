import "server-only";
import type { QwenPort } from "@/domain/ports/qwen";
import {
  getValidatedQwenApiKey,
  isStrictProductionRuntime,
  RuntimeConfigurationError,
} from "@/lib/server/runtime-config";
import { DeterministicQwenAdapter } from "./deterministic-qwen";
import { LiveQwenAdapter } from "./qwen-adapter";

export interface QwenFactoryOptions {
  forceLive?: boolean;
  forceDeterministic?: boolean;
}

export function createQwenAdapter(options: QwenFactoryOptions = {}): QwenPort {
  const apiKey = getValidatedQwenApiKey();
  const strictProduction = isStrictProductionRuntime();
  if (strictProduction && options.forceDeterministic) {
    throw new RuntimeConfigurationError([{ field: "QWEN_API_KEY", code: "invalid" }]);
  }
  const deterministic =
    options.forceDeterministic ||
    (!options.forceLive &&
      !strictProduction &&
      (process.env.NODE_ENV === "test" || process.env.CI === "true" || !apiKey));
  if (deterministic) return new DeterministicQwenAdapter();
  if (!apiKey) {
    throw new RuntimeConfigurationError([{ field: "QWEN_API_KEY", code: "missing" }]);
  }
  return new LiveQwenAdapter({
    apiKey,
    baseURL: process.env.QWEN_BASE_URL,
    chatModel: process.env.QWEN_CHAT_MODEL,
    fastModel: process.env.QWEN_FAST_MODEL,
    embeddingModel: process.env.QWEN_EMBEDDING_MODEL,
  });
}
