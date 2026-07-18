import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const adapterMocks = vi.hoisted(() => ({
  deterministicConstructor: vi.fn(),
  liveConstructor: vi.fn(),
}));

vi.mock("./deterministic-qwen", () => ({
  DeterministicQwenAdapter: class MockDeterministicQwenAdapter {
    readonly mode = "deterministic";

    constructor() {
      adapterMocks.deterministicConstructor();
    }
  },
}));

vi.mock("./qwen-adapter", () => ({
  LiveQwenAdapter: class MockLiveQwenAdapter {
    readonly mode = "live";

    constructor(options: unknown) {
      adapterMocks.liveConstructor(options);
    }
  },
}));

import { createQwenAdapter } from "./factory";

function productionEnvironment() {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("CI", "false");
  vi.stubEnv("QWEN_API_KEY", "");
  vi.stubEnv("QWEN_BASE_URL", "");
  vi.stubEnv("QWEN_CHAT_MODEL", "");
  vi.stubEnv("QWEN_FAST_MODEL", "");
  vi.stubEnv("QWEN_EMBEDDING_MODEL", "");
}

beforeEach(() => {
  adapterMocks.deterministicConstructor.mockReset();
  adapterMocks.liveConstructor.mockReset();
  productionEnvironment();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createQwenAdapter", () => {
  it("selects deterministic mode for tests even when a key exists", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("QWEN_API_KEY", "test-live-key");

    const adapter = createQwenAdapter();

    expect(adapter.mode).toBe("deterministic");
    expect(adapterMocks.deterministicConstructor).toHaveBeenCalledOnce();
    expect(adapterMocks.liveConstructor).not.toHaveBeenCalled();
  });

  it("selects deterministic mode in CI and when no key exists", () => {
    vi.stubEnv("CI", "true");
    expect(createQwenAdapter().mode).toBe("deterministic");

    adapterMocks.deterministicConstructor.mockClear();
    vi.stubEnv("CI", "false");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("QWEN_API_KEY", "   ");
    expect(createQwenAdapter().mode).toBe("deterministic");
    expect(adapterMocks.deterministicConstructor).toHaveBeenCalledOnce();
  });

  it("lets forceDeterministic override a live key and forceLive in test mode", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("QWEN_API_KEY", "real-key");

    const adapter = createQwenAdapter({ forceDeterministic: true, forceLive: true });

    expect(adapter.mode).toBe("deterministic");
    expect(adapterMocks.liveConstructor).not.toHaveBeenCalled();
  });

  it("selects live mode in production and forwards trimmed environment configuration", () => {
    vi.stubEnv("QWEN_API_KEY", "  real-key  ");
    vi.stubEnv("QWEN_BASE_URL", "https://custom-qwen.invalid/v1");
    vi.stubEnv("QWEN_CHAT_MODEL", "chat-model");
    vi.stubEnv("QWEN_FAST_MODEL", "fast-model");
    vi.stubEnv("QWEN_EMBEDDING_MODEL", "embedding-model");

    const adapter = createQwenAdapter();

    expect(adapter.mode).toBe("live");
    expect(adapterMocks.deterministicConstructor).not.toHaveBeenCalled();
    expect(adapterMocks.liveConstructor).toHaveBeenCalledWith({
      apiKey: "real-key",
      baseURL: "https://custom-qwen.invalid/v1",
      chatModel: "chat-model",
      fastModel: "fast-model",
      embeddingModel: "embedding-model",
    });
  });

  it("lets forceLive bypass the test/CI deterministic default", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("CI", "true");
    vi.stubEnv("QWEN_API_KEY", "forced-key");

    expect(createQwenAdapter({ forceLive: true }).mode).toBe("live");
    expect(adapterMocks.liveConstructor).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "forced-key" }),
    );
  });

  it("fails fast when live mode is forced without a key", () => {
    vi.stubEnv("QWEN_API_KEY", "   ");

    expect(() => createQwenAdapter({ forceLive: true })).toThrow(
      "Threadline production configuration is invalid.",
    );
    expect(adapterMocks.liveConstructor).not.toHaveBeenCalled();
    expect(adapterMocks.deterministicConstructor).not.toHaveBeenCalled();
  });

  it("fails closed rather than selecting deterministic mode in production", () => {
    vi.stubEnv("QWEN_API_KEY", "");

    expect(() => createQwenAdapter()).toThrow("Threadline production configuration is invalid.");
    expect(adapterMocks.liveConstructor).not.toHaveBeenCalled();
    expect(adapterMocks.deterministicConstructor).not.toHaveBeenCalled();
  });

  it("rejects forcing deterministic mode in production", () => {
    vi.stubEnv("QWEN_API_KEY", "real-key");

    expect(() => createQwenAdapter({ forceDeterministic: true })).toThrow(
      "Threadline production configuration is invalid.",
    );
    expect(adapterMocks.liveConstructor).not.toHaveBeenCalled();
    expect(adapterMocks.deterministicConstructor).not.toHaveBeenCalled();
  });

  it("rejects a known placeholder key in production", () => {
    vi.stubEnv("QWEN_API_KEY", "changeme");

    expect(() => createQwenAdapter()).toThrow("Threadline production configuration is invalid.");
    expect(adapterMocks.liveConstructor).not.toHaveBeenCalled();
  });
});
