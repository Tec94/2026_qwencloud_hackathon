import { describe, expect, it, vi } from "vitest";

import { AppError } from "@/domain/errors";
import type {
  ChatMessage,
  MemoryRecord,
  MemoryView,
  Principal,
  RiskAssessment,
  SessionExtraction,
  SessionSummaryView,
} from "@/domain/models";
import type {
  SessionView,
  ThreadlineRepositoryPort,
} from "@/domain/ports/repository";
import type { QwenPort } from "@/domain/ports/qwen";
import { HIGH_RISK_SUPPORT_MESSAGE } from "@/domain/risk";

import { ThreadlineService, type ChatStreamEvent } from "./threadline-service";

const NOW = new Date("2026-07-18T12:00:00.000Z");

const patient: Principal = {
  sessionId: "auth-patient",
  workspaceId: "workspace-1",
  userId: "patient-1",
  role: "patient",
  displayName: "Maya",
  expiresAt: new Date("2026-07-19T12:00:00.000Z"),
};

const clinician: Principal = {
  ...patient,
  sessionId: "auth-clinician",
  userId: "clinician-1",
  role: "clinician",
  displayName: "Dr. Chen",
};

const activeSession: SessionView = {
  id: "session-1",
  patientId: patient.userId,
  clinicianId: clinician.userId,
  status: "active",
  startedAt: NOW,
  endedAt: null,
  transcriptDeletedAt: null,
  safetyFollowUp: false,
  safetyReasonCodes: [],
  messageCount: 0,
};

const activeMemory: MemoryRecord = {
  id: "memory-active",
  workspaceId: patient.workspaceId,
  patientId: patient.userId,
  sourceSessionId: "session-earlier",
  category: "coping_strategy",
  statement: "Slow breathing helps me feel grounded.",
  importance: 5,
  confidence: 0.95,
  status: "active",
  embedding: [1, 0],
  embeddingModel: "embedding-test",
  embeddingDimensions: 2,
  effectiveAt: NOW,
  supersedesId: null,
  createdAt: NOW,
  updatedAt: NOW,
};

const extractedMemory = {
  category: "coping_strategy" as const,
  statement: "Slow breathing helps me feel grounded.",
  importance: 4,
  confidence: 0.9,
};

const extraction: SessionExtraction = {
  narrative: "Maya identified a grounding strategy.",
  themes: ["Grounding"],
  followUps: ["Try breathing before the next meeting."],
  safetyFlags: [],
  memories: [extractedMemory],
};

const summary: SessionSummaryView = {
  id: "summary-1",
  sessionId: activeSession.id,
  narrative: extraction.narrative,
  themes: extraction.themes,
  followUps: extraction.followUps,
  safetyFlags: extraction.safetyFlags,
  status: "pending_review",
  model: "qwen-test-chat",
  promptVersion: "threadline-test-v1",
  transcriptDeletedAt: NOW,
  createdAt: NOW,
};

const proposedMemory: MemoryView = {
  id: "memory-proposed",
  patientId: patient.userId,
  sourceSessionId: activeSession.id,
  category: extractedMemory.category,
  statement: extractedMemory.statement,
  importance: extractedMemory.importance,
  confidence: extractedMemory.confidence,
  status: "proposed",
  effectiveAt: NOW,
  supersedesId: null,
  createdAt: NOW,
  updatedAt: NOW,
};

function streamTokens(...tokens: string[]): AsyncIterable<string> {
  return (async function* tokenStream() {
    for (const token of tokens) yield token;
  })();
}

function createRepository(options: {
  messages?: ChatMessage[];
  overrides?: Partial<ThreadlineRepositoryPort>;
} = {}): ThreadlineRepositoryPort {
  const messages = [...(options.messages ?? [])];
  const defaults: ThreadlineRepositoryPort = {
    createWorkspace: vi.fn(() => []),
    findWorkspaceIdentity: vi.fn(() => null),
    createAuthSession: vi.fn(() => "auth-session"),
    findPrincipalByTokenHash: vi.fn(() => null),
    revokeAuthSession: vi.fn(),
    createTherapySession: vi.fn(() => activeSession),
    getTherapySession: vi.fn(() => activeSession),
    listTherapySessions: vi.fn(() => [activeSession]),
    appendMessage: vi.fn((_sessionId, message) => {
      messages.push(message);
    }),
    listMessages: vi.fn(() => [...messages]),
    countMessages: vi.fn(() => messages.length),
    listActiveMemories: vi.fn(() => [activeMemory]),
    listMemoriesForPrincipal: vi.fn(() => [proposedMemory]),
    saveRetrievalRun: vi.fn((_sessionId, trace) => ({
      ...trace,
      id: "trace-1",
      createdAt: NOW,
    })),
    flagSafetyFollowUp: vi.fn(),
    listRetrievalRuns: vi.fn(() => []),
    markSessionFinalizing: vi.fn(),
    markSessionFailed: vi.fn(),
    finalizeSession: vi.fn(() => ({ summary, memories: [proposedMemory] })),
    getSessionSummary: vi.fn(() => summary),
    assertMemoryEditable: vi.fn(() => proposedMemory),
    updateMemory: vi.fn((_principal, _memoryId, changes) => ({
      ...proposedMemory,
      ...changes,
    })),
    transitionMemory: vi.fn(() => proposedMemory),
    consumeRateLimit: vi.fn(() => ({ allowed: true, retryAfterMs: 0 })),
    acquireConcurrency: vi.fn(() => true),
    releaseConcurrency: vi.fn(),
    cleanupExpired: vi.fn(() => ({ workspaces: 0, sessions: 0, rateLimits: 0 })),
    isHealthy: vi.fn(() => true),
  };
  return { ...defaults, ...options.overrides };
}

function createQwen(overrides: Partial<QwenPort> = {}): QwenPort {
  return {
    chatModel: "qwen-test-chat",
    fastModel: "qwen-test-fast",
    embeddingModel: "embedding-test",
    promptVersion: "threadline-test-v1",
    mode: "deterministic",
    streamReply: vi.fn(() => streamTokens("A grounded", " response.")),
    classifyRisk: vi.fn<QwenPort["classifyRisk"]>(async () => ({
      level: "none",
      routeToSupport: false,
      reasonCodes: [],
      source: "model",
    })),
    extractSession: vi.fn(async () => extraction),
    embed: vi.fn(async () => [1, 0]),
    ...overrides,
  };
}

function sessionWithStatus(status: SessionView["status"]): SessionView {
  return { ...activeSession, status };
}

async function collectEvents(
  iterable: AsyncIterable<ChatStreamEvent>,
): Promise<ChatStreamEvent[]> {
  const events: ChatStreamEvent[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}

function expectAppError(
  error: unknown,
  expected: { code: string; status: number; message?: string },
) {
  expect(error).toBeInstanceOf(AppError);
  expect(error).toMatchObject(expected);
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("ThreadlineService session access", () => {
  it("delegates session creation and listing with the role-bound principal", () => {
    const repository = createRepository();
    const service = new ThreadlineService(repository, createQwen());

    expect(service.createSession(patient)).toBe(activeSession);
    expect(service.listSessions(clinician)).toEqual([activeSession]);
    expect(repository.createTherapySession).toHaveBeenCalledWith(patient);
    expect(repository.listTherapySessions).toHaveBeenCalledWith(clinician);
  });

  it("returns an authorized session and maps an inaccessible session to NOT_FOUND", () => {
    const repository = createRepository();
    const service = new ThreadlineService(repository, createQwen());
    expect(service.getSession(patient, activeSession.id)).toBe(activeSession);
    expect(repository.getTherapySession).toHaveBeenCalledWith(patient, activeSession.id);

    vi.mocked(repository.getTherapySession).mockReturnValueOnce(null);
    expect(() => service.getSession(clinician, "outside-workspace")).toThrowError(
      expect.objectContaining({ code: "NOT_FOUND", status: 404 }),
    );
  });
});

describe("ThreadlineService.sendMessage", () => {
  it("rejects clinician messages before reading or mutating a session", async () => {
    const repository = createRepository();
    const service = new ThreadlineService(repository, createQwen());

    await expect(
      collectEvents(
        service.sendMessage({
          principal: clinician,
          sessionId: activeSession.id,
          content: "A clinician message",
          rateLimitIdentity: "browser-1",
        }),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(repository.getTherapySession).not.toHaveBeenCalled();
    expect(repository.appendMessage).not.toHaveBeenCalled();
  });

  it("rejects missing and finalized sessions before consuming rate capacity", async () => {
    const missingRepository = createRepository({
      overrides: { getTherapySession: vi.fn(() => null) },
    });
    await expect(
      collectEvents(
        new ThreadlineService(missingRepository, createQwen()).sendMessage({
          principal: patient,
          sessionId: "missing",
          content: "Hello",
          rateLimitIdentity: "browser-1",
        }),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    expect(missingRepository.consumeRateLimit).not.toHaveBeenCalled();

    const finalizedRepository = createRepository({
      overrides: {
        getTherapySession: vi.fn(() => sessionWithStatus("finalized")),
      },
    });
    await expect(
      collectEvents(
        new ThreadlineService(finalizedRepository, createQwen()).sendMessage({
          principal: patient,
          sessionId: activeSession.id,
          content: "Hello",
          rateLimitIdentity: "browser-1",
        }),
      ),
    ).rejects.toMatchObject({ code: "SESSION_NOT_ACTIVE", status: 409 });
    expect(finalizedRepository.consumeRateLimit).not.toHaveBeenCalled();
  });

  it("enforces the 30-message session limit before the hourly workspace limit", async () => {
    const repository = createRepository({
      overrides: { countMessages: vi.fn(() => 30) },
    });
    await expect(
      collectEvents(
        new ThreadlineService(repository, createQwen()).sendMessage({
          principal: patient,
          sessionId: activeSession.id,
          content: "One more turn",
          rateLimitIdentity: "browser-1",
        }),
      ),
    ).rejects.toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
      message: "This session has reached its 30-message limit.",
    });
    expect(repository.consumeRateLimit).not.toHaveBeenCalled();
    expect(repository.acquireConcurrency).not.toHaveBeenCalled();
  });

  it("uses a workspace-scoped hourly rate key and exposes a rounded retry delay", async () => {
    const repository = createRepository({
      overrides: {
        consumeRateLimit: vi.fn(() => ({ allowed: false, retryAfterMs: 1_001 })),
      },
    });

    let thrown: unknown;
    try {
      await collectEvents(
        new ThreadlineService(repository, createQwen()).sendMessage({
          principal: patient,
          sessionId: activeSession.id,
          content: "Hello",
          rateLimitIdentity: "browser-1",
        }),
      );
    } catch (error) {
      thrown = error;
    }
    expectAppError(thrown, { code: "RATE_LIMITED", status: 429 });
    expect(thrown).toMatchObject({ details: { retryAfterSeconds: 2 } });
    expect(repository.consumeRateLimit).toHaveBeenCalledWith(
      "turn:workspace-1:browser-1",
      20,
      3_600_000,
    );
    expect(repository.acquireConcurrency).not.toHaveBeenCalled();
  });

  it("enforces two concurrent streams without releasing a permit it did not acquire", async () => {
    const repository = createRepository({
      overrides: { acquireConcurrency: vi.fn(() => false) },
    });
    await expect(
      collectEvents(
        new ThreadlineService(repository, createQwen()).sendMessage({
          principal: patient,
          sessionId: activeSession.id,
          content: "Hello",
          rateLimitIdentity: "browser-1",
        }),
      ),
    ).rejects.toMatchObject({ code: "RATE_LIMITED", status: 429 });
    expect(repository.acquireConcurrency).toHaveBeenCalledWith(
      "stream:browser-1",
      2,
      120_000,
    );
    expect(repository.appendMessage).not.toHaveBeenCalled();
    expect(repository.releaseConcurrency).not.toHaveBeenCalled();
  });

  it("applies an IP-scoped Qwen budget after the turn budget and before provider work", async () => {
    const consumeRateLimit = vi
      .fn<ThreadlineRepositoryPort["consumeRateLimit"]>()
      .mockReturnValueOnce({ allowed: true, retryAfterMs: 0 })
      .mockReturnValueOnce({ allowed: false, retryAfterMs: 2_001 });
    const repository = createRepository({ overrides: { consumeRateLimit } });
    const qwen = createQwen();

    let thrown: unknown;
    try {
      await collectEvents(
        new ThreadlineService(repository, qwen).sendMessage({
          principal: patient,
          sessionId: activeSession.id,
          content: "A low-risk reflection.",
          rateLimitIdentity: "shared-ip-hash",
        }),
      );
    } catch (error) {
      thrown = error;
    }

    expectAppError(thrown, {
      code: "RATE_LIMITED",
      status: 429,
      message: "The demo AI request limit has been reached. Try again later.",
    });
    expect(thrown).toMatchObject({ details: { retryAfterSeconds: 3 } });
    expect(consumeRateLimit.mock.calls).toEqual([
      ["turn:workspace-1:shared-ip-hash", 20, 3_600_000],
      ["qwen:shared-ip-hash", 20, 3_600_000],
    ]);
    expect(repository.acquireConcurrency).not.toHaveBeenCalled();
    expect(repository.appendMessage).not.toHaveBeenCalled();
    expect(qwen.embed).not.toHaveBeenCalled();
    expect(qwen.classifyRisk).not.toHaveBeenCalled();
    expect(qwen.streamReply).not.toHaveBeenCalled();
  });

  it("runs embedding and model risk classification in parallel", async () => {
    const embedding = deferred<number[]>();
    const classification = deferred<RiskAssessment>();
    const qwen = createQwen({
      embed: vi.fn(() => embedding.promise),
      classifyRisk: vi.fn(() => classification.promise),
      streamReply: vi.fn(() => streamTokens("Okay.")),
    });
    const repository = createRepository();
    const iterator = new ThreadlineService(repository, qwen)
      .sendMessage({
        principal: patient,
        sessionId: activeSession.id,
        content: "Breathing helped today.",
        rateLimitIdentity: "browser-1",
      })
      [Symbol.asyncIterator]();

    const firstEvent = iterator.next();
    await vi.waitFor(() => {
      expect(qwen.embed).toHaveBeenCalledOnce();
      expect(qwen.classifyRisk).toHaveBeenCalledOnce();
    });
    classification.resolve({
      level: "none",
      routeToSupport: false,
      reasonCodes: [],
      source: "model",
    });
    embedding.resolve([1, 0]);

    await expect(firstEvent).resolves.toEqual({
      done: false,
      value: { type: "token", content: "Okay." },
    });
    await iterator.return?.();
    expect(repository.releaseConcurrency).toHaveBeenCalledOnce();
  });

  it("streams a reply, retrieves eligible memory, saves a sanitized trace, and releases capacity", async () => {
    const olderMessages: ChatMessage[] = Array.from({ length: 6 }, (_, index) => ({
      role: index % 2 === 0 ? "patient" : "assistant",
      content: `${index}-${"x".repeat(500)}`,
    }));
    const repository = createRepository({ messages: olderMessages });
    const controller = new AbortController();
    const qwen = createQwen();

    const events = await collectEvents(
      new ThreadlineService(repository, qwen).sendMessage({
        principal: patient,
        sessionId: activeSession.id,
        content: "The breathing exercise helped again.",
        rateLimitIdentity: "browser-1",
        signal: controller.signal,
      }),
    );

    expect(events.map((event) => event.type)).toEqual(["token", "token", "trace", "done"]);
    expect(events.slice(0, 2)).toEqual([
      { type: "token", content: "A grounded" },
      { type: "token", content: " response." },
    ]);
    const query = vi.mocked(qwen.embed).mock.calls[0]?.[0];
    expect(query).toHaveLength(2_000);
    expect(query).toContain("patient: The breathing exercise helped again.");
    expect(repository.listActiveMemories).toHaveBeenCalledWith(patient.userId, patient.workspaceId);
    expect(qwen.streamReply).toHaveBeenCalledWith(
      expect.objectContaining({
        signal: controller.signal,
        memories: [expect.objectContaining({ id: activeMemory.id, statement: activeMemory.statement })],
      }),
    );
    expect(repository.appendMessage).toHaveBeenNthCalledWith(1, activeSession.id, {
      role: "patient",
      content: "The breathing exercise helped again.",
    });
    expect(repository.appendMessage).toHaveBeenNthCalledWith(2, activeSession.id, {
      role: "assistant",
      content: "A grounded response.",
    });
    expect(repository.saveRetrievalRun).toHaveBeenCalledWith(
      activeSession.id,
      expect.objectContaining({
        candidateCount: 1,
        contextLimit: 3_200,
        model: qwen.chatModel,
        promptVersion: qwen.promptVersion,
        selected: [expect.objectContaining({ id: activeMemory.id })],
      }),
    );
    expect(events.at(-1)).toMatchObject({
      type: "done",
      sessionId: activeSession.id,
      mode: "deterministic",
      risk: { level: "none", routeToSupport: false, source: "combined" },
    });
    expect(repository.releaseConcurrency).toHaveBeenCalledWith("stream:browser-1");
  });

  it("degrades safely when the model classifier is unavailable", async () => {
    const qwen = createQwen({
      classifyRisk: vi.fn(async () => {
        throw new Error("classifier timeout");
      }),
      streamReply: vi.fn(() => streamTokens("Still available.")),
    });
    const repository = createRepository();

    const events = await collectEvents(
      new ThreadlineService(repository, qwen).sendMessage({
        principal: patient,
        sessionId: activeSession.id,
        content: "I had a difficult day.",
        rateLimitIdentity: "browser-1",
      }),
    );
    expect(events.at(-1)).toMatchObject({
      type: "done",
      risk: {
        level: "none",
        routeToSupport: false,
        reasonCodes: ["MODEL_CLASSIFIER_UNAVAILABLE"],
        source: "combined",
      },
    });
    expect(qwen.streamReply).toHaveBeenCalledOnce();
    expect(repository.releaseConcurrency).toHaveBeenCalledOnce();
  });

  it("suppresses generation and records deterministic support routing for high-risk language", async () => {
    const qwen = createQwen();
    const repository = createRepository();
    const events = await collectEvents(
      new ThreadlineService(repository, qwen).sendMessage({
        principal: patient,
        sessionId: activeSession.id,
        content: "I might hurt myself tonight.",
        rateLimitIdentity: "browser-1",
      }),
    );

    expect(qwen.embed).not.toHaveBeenCalled();
    expect(qwen.classifyRisk).not.toHaveBeenCalled();
    expect(qwen.streamReply).not.toHaveBeenCalled();
    expect(repository.listActiveMemories).not.toHaveBeenCalled();
    expect(repository.flagSafetyFollowUp).toHaveBeenCalledWith(activeSession.id, [
      "SELF_HARM_INTENT",
    ]);
    expect(repository.appendMessage).toHaveBeenLastCalledWith(activeSession.id, {
      role: "assistant",
      content: HIGH_RISK_SUPPORT_MESSAGE,
    });
    expect(repository.saveRetrievalRun).toHaveBeenCalledWith(
      activeSession.id,
      expect.objectContaining({
        candidateCount: 0,
        selected: [],
        contextCharacters: 0,
        contextLimit: 3_200,
        model: "deterministic-safety-routing",
      }),
    );
    expect(events).toEqual([
      { type: "token", content: HIGH_RISK_SUPPORT_MESSAGE },
      {
        type: "trace",
        trace: expect.objectContaining({ id: "trace-1", model: "deterministic-safety-routing" }),
      },
      {
        type: "done",
        sessionId: activeSession.id,
        risk: expect.objectContaining({ level: "high", routeToSupport: true }),
        mode: "deterministic",
      },
    ]);
    expect(repository.acquireConcurrency).not.toHaveBeenCalled();
    expect(repository.releaseConcurrency).not.toHaveBeenCalled();
    expect(repository.consumeRateLimit).toHaveBeenCalledTimes(1);
    expect(repository.consumeRateLimit).toHaveBeenCalledWith(
      "turn:workspace-1:browser-1",
      20,
      3_600_000,
    );
  });

  it("also routes a model-only high-risk assessment to deterministic support", async () => {
    const repository = createRepository();
    const qwen = createQwen({
      classifyRisk: vi.fn<QwenPort["classifyRisk"]>(async () => ({
        level: "high",
        routeToSupport: true,
        reasonCodes: ["MODEL_HIGH_RISK"],
        source: "model",
      })),
    });
    const events = await collectEvents(
      new ThreadlineService(repository, qwen).sendMessage({
        principal: patient,
        sessionId: activeSession.id,
        content: "A phrase not matched by local rules.",
        rateLimitIdentity: "browser-1",
      }),
    );
    expect(events.at(-1)).toMatchObject({
      type: "done",
      risk: { level: "high", reasonCodes: ["MODEL_HIGH_RISK"] },
    });
    expect(qwen.streamReply).not.toHaveBeenCalled();
  });

  it("rejects an empty provider stream and always releases concurrency", async () => {
    const repository = createRepository();
    const qwen = createQwen({ streamReply: vi.fn(() => streamTokens("", "   ")) });
    await expect(
      collectEvents(
        new ThreadlineService(repository, qwen).sendMessage({
          principal: patient,
          sessionId: activeSession.id,
          content: "Hello",
          rateLimitIdentity: "browser-1",
        }),
      ),
    ).rejects.toMatchObject({ code: "QWEN_UNAVAILABLE", status: 502 });
    expect(repository.appendMessage).toHaveBeenCalledTimes(1);
    expect(repository.saveRetrievalRun).not.toHaveBeenCalled();
    expect(repository.releaseConcurrency).toHaveBeenCalledOnce();
  });

  it.each([
    [
      "embedding",
      createQwen({ embed: vi.fn(async () => Promise.reject(new Error("embedding unavailable"))) }),
    ],
    [
      "reply stream",
      createQwen({
        streamReply: vi.fn(() =>
          (async function* brokenStream() {
            yield "partial";
            throw new Error("stream disconnected");
          })(),
        ),
      }),
    ],
  ])("releases concurrency when the %s provider operation fails", async (_label, qwen) => {
    const repository = createRepository();
    await expect(
      collectEvents(
        new ThreadlineService(repository, qwen).sendMessage({
          principal: patient,
          sessionId: activeSession.id,
          content: "Hello",
          rateLimitIdentity: "browser-1",
        }),
      ),
    ).rejects.toThrow();
    expect(repository.releaseConcurrency).toHaveBeenCalledWith("stream:browser-1");
    expect(repository.appendMessage).toHaveBeenCalledTimes(1);
    expect(repository.saveRetrievalRun).not.toHaveBeenCalled();
  });
});

describe("ThreadlineService.finalizeSession", () => {
  it("rejects clinician finalization before session access", async () => {
    const repository = createRepository({
      messages: [{ role: "patient", content: "A reflection." }],
    });
    await expect(
      new ThreadlineService(repository, createQwen()).finalizeSession(
        clinician,
        activeSession.id,
        "browser-1",
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(repository.getTherapySession).not.toHaveBeenCalled();
    expect(repository.markSessionFinalizing).not.toHaveBeenCalled();
  });

  it("rejects finalized sessions and empty transcripts without changing status", async () => {
    const finalizedRepository = createRepository({
      messages: [{ role: "patient", content: "A reflection." }],
      overrides: {
        getTherapySession: vi.fn(() => sessionWithStatus("finalized")),
      },
    });
    await expect(
      new ThreadlineService(finalizedRepository, createQwen()).finalizeSession(
        patient,
        activeSession.id,
        "browser-1",
      ),
    ).rejects.toMatchObject({ code: "SESSION_NOT_ACTIVE", status: 409 });
    expect(finalizedRepository.listMessages).not.toHaveBeenCalled();

    const emptyRepository = createRepository();
    await expect(
      new ThreadlineService(emptyRepository, createQwen()).finalizeSession(
        patient,
        activeSession.id,
        "browser-1",
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
    expect(emptyRepository.markSessionFinalizing).not.toHaveBeenCalled();
  });

  it("rate-limits finalization by IP before changing status or calling Qwen", async () => {
    const repository = createRepository({
      messages: [{ role: "patient", content: "A reflection." }],
      overrides: {
        consumeRateLimit: vi.fn(() => ({ allowed: false, retryAfterMs: 4_001 })),
      },
    });
    const qwen = createQwen();

    let thrown: unknown;
    try {
      await new ThreadlineService(repository, qwen).finalizeSession(
        patient,
        activeSession.id,
        "shared-ip-hash",
      );
    } catch (error) {
      thrown = error;
    }

    expectAppError(thrown, { code: "RATE_LIMITED", status: 429 });
    expect(thrown).toMatchObject({ details: { retryAfterSeconds: 5 } });
    expect(repository.consumeRateLimit).toHaveBeenCalledWith(
      "qwen:shared-ip-hash",
      20,
      3_600_000,
    );
    expect(repository.markSessionFinalizing).not.toHaveBeenCalled();
    expect(qwen.extractSession).not.toHaveBeenCalled();
    expect(qwen.embed).not.toHaveBeenCalled();
  });

  it("extracts known memories, embeds proposals, and commits through one repository call", async () => {
    const transcript: ChatMessage[] = [
      { role: "patient", content: "Breathing helped." },
      { role: "assistant", content: "What changed?" },
    ];
    const forgottenMemory: MemoryRecord = {
      ...activeMemory,
      id: "forgotten-contentless",
      status: "forgotten",
      statement: null,
      embedding: null,
    };
    const repository = createRepository({
      messages: transcript,
      overrides: { listActiveMemories: vi.fn(() => [activeMemory, forgottenMemory]) },
    });
    const firstVector = deferred<number[]>();
    const secondVector = deferred<number[]>();
    const twoMemoryExtraction: SessionExtraction = {
      ...extraction,
      memories: [
        extractedMemory,
        {
          category: "goal",
          statement: "I want to pause before stressful meetings.",
          importance: 5,
          confidence: 0.85,
        },
      ],
    };
    const qwen = createQwen({
      extractSession: vi.fn(async () => twoMemoryExtraction),
      embed: vi
        .fn<QwenPort["embed"]>()
        .mockImplementationOnce(() => firstVector.promise)
        .mockImplementationOnce(() => secondVector.promise),
    });
    const service = new ThreadlineService(repository, qwen);

    const resultPromise = service.finalizeSession(patient, activeSession.id, "browser-1");
    await vi.waitFor(() => expect(qwen.embed).toHaveBeenCalledTimes(2));
    secondVector.resolve([0, 1]);
    firstVector.resolve([1, 0]);
    const result = await resultPromise;

    expect(result).toEqual({ summary, memories: [proposedMemory] });
    expect(repository.markSessionFinalizing).toHaveBeenCalledWith(activeSession.id);
    expect(repository.listActiveMemories).toHaveBeenCalledWith(patient.userId, patient.workspaceId);
    expect(qwen.extractSession).toHaveBeenCalledWith({
      messages: transcript,
      knownMemories: [
        {
          id: activeMemory.id,
          statement: activeMemory.statement,
          category: activeMemory.category,
        },
      ],
    });
    expect(qwen.embed).toHaveBeenNthCalledWith(1, extractedMemory.statement);
    expect(qwen.embed).toHaveBeenNthCalledWith(2, twoMemoryExtraction.memories[1]?.statement);
    expect(repository.finalizeSession).toHaveBeenCalledOnce();
    const transactionArgs = vi.mocked(repository.finalizeSession).mock.calls[0];
    expect(transactionArgs?.slice(0, 3)).toEqual([
      patient,
      activeSession.id,
      twoMemoryExtraction,
    ]);
    expect(transactionArgs?.[3]).toEqual([
      {
        id: expect.stringMatching(/^[0-9a-f-]{36}$/i),
        embedding: [1, 0],
        embeddingModel: qwen.embeddingModel,
      },
      {
        id: expect.stringMatching(/^[0-9a-f-]{36}$/i),
        embedding: [0, 1],
        embeddingModel: qwen.embeddingModel,
      },
    ]);
    expect(transactionArgs?.slice(4)).toEqual([qwen.chatModel, qwen.promptVersion]);
    expect(repository.markSessionFailed).not.toHaveBeenCalled();
  });

  it("commits a valid extraction with no memory candidates without embedding", async () => {
    const repository = createRepository({
      messages: [{ role: "patient", content: "Nothing durable to save." }],
    });
    const qwen = createQwen({
      extractSession: vi.fn(async () => ({ ...extraction, memories: [] })),
    });
    await new ThreadlineService(repository, qwen).finalizeSession(
      patient,
      activeSession.id,
      "browser-1",
    );
    expect(qwen.embed).not.toHaveBeenCalled();
    expect(repository.finalizeSession).toHaveBeenCalledWith(
      patient,
      activeSession.id,
      { ...extraction, memories: [] },
      [],
      qwen.chatModel,
      qwen.promptVersion,
    );
  });

  it("permits retrying a previously failed session", async () => {
    const repository = createRepository({
      messages: [{ role: "patient", content: "Please retry extraction." }],
      overrides: {
        getTherapySession: vi.fn(() => sessionWithStatus("failed")),
      },
    });
    await expect(
      new ThreadlineService(repository, createQwen()).finalizeSession(
        patient,
        activeSession.id,
        "browser-1",
      ),
    ).resolves.toEqual({ summary, memories: [proposedMemory] });
    expect(repository.markSessionFinalizing).toHaveBeenCalledOnce();
    expect(repository.finalizeSession).toHaveBeenCalledOnce();
  });

  it.each([
    [
      "extraction",
      createQwen({
        extractSession: vi.fn(async () => Promise.reject(new Error("malformed twice"))),
      }),
    ],
    [
      "candidate embedding",
      createQwen({ embed: vi.fn(async () => Promise.reject(new Error("embedding failed"))) }),
    ],
  ])("marks the session failed and wraps an unexpected %s error for retry", async (_label, qwen) => {
    const repository = createRepository({
      messages: [{ role: "patient", content: "A preserved reflection." }],
    });
    let thrown: unknown;
    try {
      await new ThreadlineService(repository, qwen).finalizeSession(
        patient,
        activeSession.id,
        "browser-1",
      );
    } catch (error) {
      thrown = error;
    }
    expectAppError(thrown, {
      code: "EXTRACTION_FAILED",
      status: 502,
      message: "The session is preserved and can be finalized again.",
    });
    expect(repository.markSessionFinalizing).toHaveBeenCalledOnce();
    expect(repository.markSessionFailed).toHaveBeenCalledWith(activeSession.id);
    expect(repository.finalizeSession).not.toHaveBeenCalled();
  });

  it("preserves typed provider and repository transaction errors while marking failure", async () => {
    const transcript = [{ role: "patient" as const, content: "A reflection." }];
    const providerError = new AppError("QWEN_UNAVAILABLE", "Qwen timed out.", 502);
    const providerRepository = createRepository({ messages: transcript });
    await expect(
      new ThreadlineService(
        providerRepository,
        createQwen({ extractSession: vi.fn(async () => Promise.reject(providerError)) }),
      ).finalizeSession(patient, activeSession.id, "browser-1"),
    ).rejects.toBe(providerError);
    expect(providerRepository.markSessionFailed).toHaveBeenCalledOnce();

    const transactionError = new AppError("CONFLICT", "Contradiction approval required.", 409);
    const transactionRepository = createRepository({
      messages: transcript,
      overrides: {
        finalizeSession: vi.fn(() => {
          throw transactionError;
        }),
      },
    });
    await expect(
      new ThreadlineService(transactionRepository, createQwen()).finalizeSession(
        patient,
        activeSession.id,
        "browser-1",
      ),
    ).rejects.toBe(transactionError);
    expect(transactionRepository.markSessionFailed).toHaveBeenCalledOnce();
  });
});

describe("ThreadlineService.updateMemory", () => {
  it("re-embeds an edited statement and passes model metadata to the repository", async () => {
    const repository = createRepository();
    const qwen = createQwen({ embed: vi.fn(async () => [0.25, 0.75]) });
    const changes = { statement: "A revised clinician-approved statement.", importance: 5 };

    await new ThreadlineService(repository, qwen).updateMemory(
      clinician,
      proposedMemory.id,
      changes,
      "browser-1",
    );
    expect(qwen.embed).toHaveBeenCalledWith(changes.statement);
    expect(repository.assertMemoryEditable).toHaveBeenCalledWith(
      clinician,
      proposedMemory.id,
    );
    expect(repository.consumeRateLimit).toHaveBeenCalledWith(
      "qwen:browser-1",
      20,
      3_600_000,
    );
    expect(repository.updateMemory).toHaveBeenCalledWith(clinician, proposedMemory.id, {
      ...changes,
      embedding: [0.25, 0.75],
      embeddingModel: qwen.embeddingModel,
    });
  });

  it("updates importance without invoking the embedding provider", async () => {
    const repository = createRepository();
    const qwen = createQwen();
    await new ThreadlineService(repository, qwen).updateMemory(
      clinician,
      proposedMemory.id,
      { importance: 3 },
      "browser-1",
    );
    expect(qwen.embed).not.toHaveBeenCalled();
    expect(repository.consumeRateLimit).not.toHaveBeenCalled();
    expect(repository.updateMemory).toHaveBeenCalledWith(clinician, proposedMemory.id, {
      importance: 3,
    });
  });

  it("rejects non-clinicians before invoking Qwen or the repository", async () => {
    const repository = createRepository();
    const qwen = createQwen();
    await expect(
      new ThreadlineService(repository, qwen).updateMemory(
        patient,
        proposedMemory.id,
        { statement: "An unauthorized edit must not reach the provider." },
        "browser-1",
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(qwen.embed).not.toHaveBeenCalled();
    expect(repository.assertMemoryEditable).not.toHaveBeenCalled();
    expect(repository.updateMemory).not.toHaveBeenCalled();
  });

  it("authorizes workspace, consent, and editability before rate or embedding work", async () => {
    const authorizationError = new AppError("NOT_FOUND", "Memory not found.", 404);
    const repository = createRepository({
      overrides: {
        assertMemoryEditable: vi.fn(() => {
          throw authorizationError;
        }),
      },
    });
    const qwen = createQwen();

    await expect(
      new ThreadlineService(repository, qwen).updateMemory(
        clinician,
        "outside-workspace",
        { statement: "This must never be embedded." },
        "shared-ip-hash",
      ),
    ).rejects.toBe(authorizationError);
    expect(repository.consumeRateLimit).not.toHaveBeenCalled();
    expect(qwen.embed).not.toHaveBeenCalled();
    expect(repository.updateMemory).not.toHaveBeenCalled();
  });

  it("rate-limits authorized statement re-embedding by IP", async () => {
    const repository = createRepository({
      overrides: {
        consumeRateLimit: vi.fn(() => ({ allowed: false, retryAfterMs: 999 })),
      },
    });
    const qwen = createQwen();

    await expect(
      new ThreadlineService(repository, qwen).updateMemory(
        clinician,
        proposedMemory.id,
        { statement: "An authorized but quota-limited edit." },
        "shared-ip-hash",
      ),
    ).rejects.toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
      details: { retryAfterSeconds: 1 },
    });
    expect(repository.assertMemoryEditable).toHaveBeenCalledOnce();
    expect(repository.consumeRateLimit).toHaveBeenCalledWith(
      "qwen:shared-ip-hash",
      20,
      3_600_000,
    );
    expect(qwen.embed).not.toHaveBeenCalled();
    expect(repository.updateMemory).not.toHaveBeenCalled();
  });
});
