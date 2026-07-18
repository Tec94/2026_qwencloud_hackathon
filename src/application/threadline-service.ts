import { AppError } from "@/domain/errors";
import type {
  Principal,
  RetrievalTrace,
  RiskAssessment,
  SessionSummaryView,
} from "@/domain/models";
import type { ThreadlineRepositoryPort } from "@/domain/ports/repository";
import type { QwenPort } from "@/domain/ports/qwen";
import { assessDeterministicRisk, combineRiskAssessments, HIGH_RISK_SUPPORT_MESSAGE } from "@/domain/risk";
import { retrieveMemories } from "@/domain/retrieval";

export type ChatStreamEvent =
  | { type: "token"; content: string }
  | { type: "trace"; trace: RetrievalTrace }
  | { type: "done"; sessionId: string; risk: RiskAssessment; mode: QwenPort["mode"] };

const RATE_WINDOW_MS = 60 * 60 * 1_000;
const TURN_LIMIT = 20;
const QWEN_OPERATION_LIMIT = 20;

export class ThreadlineService {
  constructor(
    private readonly repository: ThreadlineRepositoryPort,
    private readonly qwen: QwenPort,
  ) {}

  createSession(principal: Principal) {
    return this.repository.createTherapySession(principal);
  }

  listSessions(principal: Principal) {
    return this.repository.listTherapySessions(principal);
  }

  getSession(principal: Principal, sessionId: string) {
    const session = this.repository.getTherapySession(principal, sessionId);
    if (!session) throw new AppError("NOT_FOUND", "Session not found.", 404);
    return session;
  }

  async *sendMessage(input: {
    principal: Principal;
    sessionId: string;
    content: string;
    rateLimitIdentity: string;
    signal?: AbortSignal;
  }): AsyncIterable<ChatStreamEvent> {
    const { principal, sessionId, content } = input;
    if (principal.role !== "patient") {
      throw new AppError("FORBIDDEN", "Only the patient can send reflection messages.", 403);
    }
    const session = this.getSession(principal, sessionId);
    if (session.status !== "active") {
      throw new AppError("SESSION_NOT_ACTIVE", "This reflection session is no longer active.", 409);
    }
    if (this.repository.countMessages(sessionId) >= 30) {
      throw new AppError("RATE_LIMITED", "This session has reached its 30-message limit.", 429);
    }
    const turnLimit = this.repository.consumeRateLimit(
      `turn:${principal.workspaceId}:${input.rateLimitIdentity}`,
      TURN_LIMIT,
      RATE_WINDOW_MS,
    );
    if (!turnLimit.allowed) {
      throw new AppError("RATE_LIMITED", "The demo turn limit has been reached. Try again later.", 429, {
        retryAfterSeconds: Math.ceil(turnLimit.retryAfterMs / 1_000),
      });
    }

    const rules = assessDeterministicRisk(content);
    const startedAt = Date.now();
    if (rules.routeToSupport) {
      this.repository.appendMessage(sessionId, { role: "patient", content });
      this.repository.flagSafetyFollowUp(sessionId, rules.reasonCodes);
      this.repository.appendMessage(sessionId, {
        role: "assistant",
        content: HIGH_RISK_SUPPORT_MESSAGE,
      });
      const trace = this.repository.saveRetrievalRun(sessionId, {
        candidateCount: 0,
        selected: [],
        contextCharacters: 0,
        contextLimit: 3_200,
        model: "deterministic-safety-routing",
        promptVersion: this.qwen.promptVersion,
        latencyMs: Date.now() - startedAt,
      });
      yield { type: "token", content: HIGH_RISK_SUPPORT_MESSAGE };
      yield { type: "trace", trace };
      yield { type: "done", sessionId, risk: rules, mode: this.qwen.mode };
      return;
    }

    this.consumeQwenOperation(input.rateLimitIdentity);
    const concurrencyKey = `stream:${input.rateLimitIdentity}`;
    if (!this.repository.acquireConcurrency(concurrencyKey, 2, 2 * 60 * 1_000)) {
      throw new AppError("RATE_LIMITED", "Two responses are already streaming for this network.", 429);
    }

    try {
      this.repository.appendMessage(sessionId, { role: "patient", content });
      const messages = this.repository.listMessages(sessionId);
      const recent = messages.slice(-5);
      const query = recent
        .map((message) => `${message.role}: ${message.content}`)
        .join("\n")
        .slice(-2_000);
      const [queryEmbedding, modelRisk] = await Promise.all([
        this.qwen.embed(query),
        this.qwen.classifyRisk(content).catch(() => ({
          level: rules.level,
          routeToSupport: rules.routeToSupport,
          reasonCodes: ["MODEL_CLASSIFIER_UNAVAILABLE"],
          source: "model" as const,
        })),
      ]);
      const risk = combineRiskAssessments(rules, modelRisk);

      if (risk.routeToSupport) {
        this.repository.flagSafetyFollowUp(sessionId, risk.reasonCodes);
        this.repository.appendMessage(sessionId, {
          role: "assistant",
          content: HIGH_RISK_SUPPORT_MESSAGE,
        });
        const trace = this.repository.saveRetrievalRun(sessionId, {
          candidateCount: 0,
          selected: [],
          contextCharacters: 0,
          contextLimit: 3_200,
          model: "deterministic-safety-routing",
          promptVersion: this.qwen.promptVersion,
          latencyMs: Date.now() - startedAt,
        });
        yield { type: "token", content: HIGH_RISK_SUPPORT_MESSAGE };
        yield { type: "trace", trace };
        yield { type: "done", sessionId, risk, mode: this.qwen.mode };
        return;
      }

      const candidates = this.repository.listActiveMemories(session.patientId, principal.workspaceId);
      const selected = retrieveMemories(candidates, queryEmbedding, {
        maxMemories: 5,
        maxPerCategory: 2,
        characterBudget: 3_200,
      });
      let assistantContent = "";
      for await (const token of this.qwen.streamReply({
        messages,
        memories: selected,
        signal: input.signal,
      })) {
        assistantContent += token;
        yield { type: "token", content: token };
      }
      if (assistantContent.trim().length === 0) {
        throw new AppError("QWEN_UNAVAILABLE", "Qwen returned an empty response.", 502);
      }
      this.repository.appendMessage(sessionId, { role: "assistant", content: assistantContent });
      const trace = this.repository.saveRetrievalRun(sessionId, {
        candidateCount: candidates.length,
        selected,
        contextCharacters: selected.reduce((sum, memory) => sum + memory.estimatedCharacters, 0),
        contextLimit: 3_200,
        model: this.qwen.chatModel,
        promptVersion: this.qwen.promptVersion,
        latencyMs: Date.now() - startedAt,
      });
      yield { type: "trace", trace };
      yield { type: "done", sessionId, risk, mode: this.qwen.mode };
    } finally {
      this.repository.releaseConcurrency(concurrencyKey);
    }
  }

  async finalizeSession(
    principal: Principal,
    sessionId: string,
    rateLimitIdentity: string,
  ): Promise<{
    summary: SessionSummaryView;
    memories: ReturnType<ThreadlineRepositoryPort["listMemoriesForPrincipal"]>;
  }> {
    if (principal.role !== "patient") {
      throw new AppError("FORBIDDEN", "Only the patient can end this reflection session.", 403);
    }
    const session = this.getSession(principal, sessionId);
    if (session.status !== "active" && session.status !== "failed") {
      throw new AppError("SESSION_NOT_ACTIVE", "This reflection session cannot be finalized again.", 409);
    }
    const messages = this.repository.listMessages(sessionId);
    if (messages.length === 0) {
      throw new AppError("VALIDATION_ERROR", "Add at least one reflection before ending the session.", 400);
    }
    this.consumeQwenOperation(rateLimitIdentity);
    this.repository.markSessionFinalizing(sessionId);
    try {
      const knownMemories = this.repository
        .listActiveMemories(session.patientId, principal.workspaceId)
        .flatMap((memory) =>
          memory.statement
            ? [{ id: memory.id, statement: memory.statement, category: memory.category }]
            : [],
        );
      const extraction = await this.qwen.extractSession({ messages, knownMemories });
      const vectors = await Promise.all(extraction.memories.map((memory) => this.qwen.embed(memory.statement)));
      return this.repository.finalizeSession(
        principal,
        sessionId,
        extraction,
        extraction.memories.map((_, index) => ({
          id: crypto.randomUUID(),
          embedding: vectors[index] ?? [],
          embeddingModel: this.qwen.embeddingModel,
        })),
        this.qwen.chatModel,
        this.qwen.promptVersion,
      );
    } catch (error) {
      this.repository.markSessionFailed(sessionId);
      if (error instanceof AppError) throw error;
      throw new AppError("EXTRACTION_FAILED", "The session is preserved and can be finalized again.", 502);
    }
  }

  async updateMemory(
    principal: Principal,
    memoryId: string,
    changes: { statement?: string; importance?: number },
    rateLimitIdentity: string,
  ) {
    if (principal.role !== "clinician") {
      throw new AppError(
        "FORBIDDEN",
        "Only the linked clinician can edit a proposed memory.",
        403,
      );
    }
    this.repository.assertMemoryEditable(principal, memoryId);
    const statement = changes.statement;
    if (statement !== undefined) this.consumeQwenOperation(rateLimitIdentity);
    const embedding = statement !== undefined ? await this.qwen.embed(statement) : undefined;
    return this.repository.updateMemory(principal, memoryId, {
      ...changes,
      ...(embedding
        ? { embedding, embeddingModel: this.qwen.embeddingModel }
      : {}),
    });
  }

  private consumeQwenOperation(rateLimitIdentity: string): void {
    const limit = this.repository.consumeRateLimit(
      `qwen:${rateLimitIdentity}`,
      QWEN_OPERATION_LIMIT,
      RATE_WINDOW_MS,
    );
    if (!limit.allowed) {
      throw new AppError(
        "RATE_LIMITED",
        "The demo AI request limit has been reached. Try again later.",
        429,
        { retryAfterSeconds: Math.ceil(limit.retryAfterMs / 1_000) },
      );
    }
  }
}
