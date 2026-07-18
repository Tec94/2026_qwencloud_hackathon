import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  ExtractedMemory,
  MemoryView,
  Principal,
  RetrievalTrace,
  SessionSummaryView,
} from "@/domain/models";
import type { ErrorCode } from "@/domain/errors";
import type { DemoIdentity, SessionView } from "@/domain/ports/repository";
import { createDatabase, type DatabaseContext } from "./database";
import { ThreadlineRepository } from "./threadline-repository";

interface WorkspaceFixture {
  patientIdentity: DemoIdentity;
  clinicianIdentity: DemoIdentity;
  patient: Principal;
  clinician: Principal;
}

interface FinalizedFixture {
  session: SessionView;
  summary: SessionSummaryView;
  memories: MemoryView[];
}

const DEFAULT_MEMORY: ExtractedMemory = {
  category: "coping_strategy",
  statement: "Slow breathing helps me feel grounded.",
  importance: 4,
  confidence: 0.9,
};

function expectAppError(action: () => unknown, code: ErrorCode): void {
  try {
    action();
    throw new Error(`Expected ${code} to be thrown.`);
  } catch (error) {
    expect(error).toMatchObject({ name: "AppError", code });
  }
}

describe("ThreadlineRepository", () => {
  let context: DatabaseContext;
  let repository: ThreadlineRepository;
  let primary: WorkspaceFixture;
  let workspaceSequence: number;

  function createWorkspaceFixture(): WorkspaceFixture {
    workspaceSequence += 1;
    const identities = repository.createWorkspace();
    const patientIdentity = identities.find((identity) => identity.role === "patient")!;
    const clinicianIdentity = identities.find((identity) => identity.role === "clinician")!;
    const patientHash = `patient-hash-${workspaceSequence}`;
    const clinicianHash = `clinician-hash-${workspaceSequence}`;
    repository.createAuthSession(patientIdentity, patientHash, patientIdentity.expiresAt);
    repository.createAuthSession(clinicianIdentity, clinicianHash, clinicianIdentity.expiresAt);
    return {
      patientIdentity,
      clinicianIdentity,
      patient: repository.findPrincipalByTokenHash(patientHash)!,
      clinician: repository.findPrincipalByTokenHash(clinicianHash)!,
    };
  }

  function finalizeMemories(
    memories: ExtractedMemory[] = [DEFAULT_MEMORY],
    principal: Principal = primary.patient,
  ): FinalizedFixture {
    const session = repository.createTherapySession(principal);
    repository.appendMessage(session.id, {
      role: "patient",
      content: "Breathing helped me feel grounded.",
      createdAt: new Date("2026-07-18T12:00:00.000Z"),
    });
    repository.appendMessage(session.id, {
      role: "assistant",
      content: "What changed?",
      createdAt: new Date("2026-07-18T12:00:01.000Z"),
    });
    repository.markSessionFinalizing(session.id);
    const result = repository.finalizeSession(
      principal,
      session.id,
      {
        narrative: "The patient identified durable strategies.",
        themes: ["Grounding"],
        followUps: ["Review the strategy"],
        safetyFlags: [],
        memories,
      },
      memories.map((_, index) => ({
        id: crypto.randomUUID(),
        embedding: [1 - index * 0.1, index * 0.1],
        embeddingModel: "test-embedding-v1",
      })),
      "test-chat",
      "test-v1",
    );
    return { session, summary: result.summary, memories: result.memories };
  }

  beforeEach(() => {
    context = createDatabase("file::memory:");
    repository = new ThreadlineRepository(context);
    workspaceSequence = 0;
    primary = createWorkspaceFixture();
  });

  afterEach(() => context.sqlite.close());

  it("creates isolated identities and accepts only live workspace and auth sessions", () => {
    expect(repository.findWorkspaceIdentity(primary.patient.workspaceId, "patient")).toMatchObject({
      userId: primary.patient.userId,
      role: "patient",
    });
    expect(repository.findWorkspaceIdentity("missing-workspace", "patient")).toBeNull();
    expect(repository.findPrincipalByTokenHash("missing-token")).toBeNull();

    const shortExpiry = new Date(Date.now() + 30_000);
    const sessionId = repository.createAuthSession(
      primary.patientIdentity,
      "short-lived-token",
      shortExpiry,
    );
    expect(repository.findPrincipalByTokenHash("short-lived-token")?.expiresAt).toEqual(shortExpiry);
    expect(repository.findPrincipalByTokenHash("short-lived-token", shortExpiry)).toBeNull();

    repository.revokeAuthSession(sessionId);
    expect(repository.findPrincipalByTokenHash("short-lived-token")).toBeNull();

    context.sqlite
      .prepare("UPDATE demo_workspaces SET expires_at = ? WHERE id = ?")
      .run(new Date(Date.now() - 1).toISOString(), primary.patient.workspaceId);
    expect(repository.findWorkspaceIdentity(primary.patient.workspaceId, "patient")).toBeNull();
    expect(repository.findPrincipalByTokenHash("patient-hash-1")).toBeNull();
  });

  it("enforces role, ownership, and workspace boundaries for session reads and listings", () => {
    expectAppError(() => repository.createTherapySession(primary.clinician), "FORBIDDEN");
    const session = repository.createTherapySession(primary.patient);
    repository.appendMessage(session.id, { role: "patient", content: "Today was difficult." });

    expect(repository.getTherapySession(primary.patient, session.id)).toMatchObject({
      id: session.id,
      messageCount: 1,
    });
    expect(repository.getTherapySession(primary.clinician, session.id)?.id).toBe(session.id);
    expect(repository.listTherapySessions(primary.patient).map(({ id }) => id)).toEqual([session.id]);
    expect(repository.listTherapySessions(primary.clinician).map(({ id }) => id)).toEqual([session.id]);

    const other = createWorkspaceFixture();
    expect(repository.getTherapySession(other.patient, session.id)).toBeNull();
    expect(repository.getTherapySession(other.clinician, session.id)).toBeNull();
    expect(repository.listTherapySessions(other.patient)).toEqual([]);
    expect(repository.listTherapySessions(other.clinician)).toEqual([]);
    expectAppError(() => repository.getSessionSummary(other.clinician, session.id), "NOT_FOUND");
    expectAppError(() => repository.listRetrievalRuns(other.patient, session.id), "NOT_FOUND");
  });

  it("revokes clinician access across every session and memory path while preserving patient access", () => {
    const finalized = finalizeMemories([
      DEFAULT_MEMORY,
      {
        category: "goal",
        statement: "I want to protect one quiet evening each week.",
        importance: 4,
        confidence: 0.85,
      },
    ]);
    const activeMemoryId = finalized.memories[0]!.id;
    const proposedMemoryId = finalized.memories[1]!.id;
    repository.transitionMemory(primary.clinician, activeMemoryId, "approve");
    repository.saveRetrievalRun(finalized.session.id, {
      candidateCount: 1,
      selected: [],
      contextCharacters: 0,
      contextLimit: 3_200,
      model: "test-chat",
      promptVersion: "retrieval-v1",
    });
    expect(repository.listActiveMemories(primary.patient.userId, primary.patient.workspaceId)).toHaveLength(1);

    context.sqlite
      .prepare(
        `UPDATE care_relationships
         SET consent_status = 'revoked', revoked_at = ?
         WHERE workspace_id = ? AND patient_id = ?`,
      )
      .run(new Date().toISOString(), primary.patient.workspaceId, primary.patient.userId);

    expectAppError(() => repository.createTherapySession(primary.patient), "CONSENT_REQUIRED");
    expect(repository.listActiveMemories(primary.patient.userId, primary.patient.workspaceId)).toEqual([]);
    expect(repository.getTherapySession(primary.patient, finalized.session.id)?.id).toBe(
      finalized.session.id,
    );
    expect(repository.getSessionSummary(primary.patient, finalized.session.id)?.id).toBe(
      finalized.summary.id,
    );
    expect(repository.listRetrievalRuns(primary.patient, finalized.session.id)).toHaveLength(1);
    expect(repository.listMemoriesForPrincipal(primary.patient, primary.patient.userId)).toHaveLength(2);
    expect(repository.transitionMemory(primary.patient, proposedMemoryId, "dispute")).toMatchObject({
      id: proposedMemoryId,
      status: "disputed",
    });

    expect(repository.getTherapySession(primary.clinician, finalized.session.id)).toBeNull();
    expect(repository.listTherapySessions(primary.clinician)).toEqual([]);
    expectAppError(
      () => repository.getSessionSummary(primary.clinician, finalized.session.id),
      "NOT_FOUND",
    );
    expectAppError(
      () => repository.listRetrievalRuns(primary.clinician, finalized.session.id),
      "NOT_FOUND",
    );
    expectAppError(
      () => repository.listMemoriesForPrincipal(primary.clinician, primary.patient.userId),
      "FORBIDDEN",
    );
    expectAppError(
      () => repository.updateMemory(primary.clinician, proposedMemoryId, { importance: 5 }),
      "FORBIDDEN",
    );
    expectAppError(
      () => repository.transitionMemory(primary.clinician, proposedMemoryId, "approve"),
      "FORBIDDEN",
    );
  });

  it("keeps memory records private across patients, clinicians, and workspaces", () => {
    const finalized = finalizeMemories();
    const memoryId = finalized.memories[0]!.id;
    const other = createWorkspaceFixture();

    expectAppError(
      () => repository.listMemoriesForPrincipal(primary.patient, other.patient.userId),
      "FORBIDDEN",
    );
    expectAppError(
      () => repository.listMemoriesForPrincipal(primary.clinician, other.patient.userId),
      "FORBIDDEN",
    );
    expectAppError(() => repository.transitionMemory(other.clinician, memoryId, "approve"), "NOT_FOUND");
    expectAppError(() => repository.updateMemory(other.clinician, memoryId, { importance: 5 }), "NOT_FOUND");
  });

  it("atomically saves extraction, reads summary fields, and deletes the raw transcript", () => {
    const finalized = finalizeMemories();
    expect(repository.listMessages(finalized.session.id)).toEqual([]);
    expect(repository.countMessages(finalized.session.id)).toBe(0);
    expect(finalized.summary).toMatchObject({
      narrative: "The patient identified durable strategies.",
      themes: ["Grounding"],
      followUps: ["Review the strategy"],
      safetyFlags: [],
      status: "pending_review",
      model: "test-chat",
      promptVersion: "test-v1",
    });
    expect(finalized.summary.transcriptDeletedAt).toBeInstanceOf(Date);
    expect(finalized.memories[0]).toMatchObject({
      status: "proposed",
      confidence: 0.9,
    });
    expect(repository.getTherapySession(primary.patient, finalized.session.id)).toMatchObject({
      status: "finalized",
      messageCount: 0,
    });
    expect(repository.getSessionSummary(primary.clinician, finalized.session.id)?.id).toBe(
      finalized.summary.id,
    );
  });

  it("retains a failed transcript for retry and prevents duplicate finalization", () => {
    const session = repository.createTherapySession(primary.patient);
    repository.appendMessage(session.id, { role: "patient", content: "Keep this until retry." });
    repository.markSessionFinalizing(session.id);
    repository.markSessionFailed(session.id);
    expect(repository.getTherapySession(primary.patient, session.id)?.status).toBe("failed");
    expect(repository.listMessages(session.id)).toHaveLength(1);

    repository.markSessionFinalizing(session.id);
    repository.finalizeSession(
      primary.patient,
      session.id,
      {
        narrative: "Retry succeeded.",
        themes: [],
        followUps: [],
        safetyFlags: [],
        memories: [],
      },
      [],
      "test-chat",
      "test-v1",
    );
    expect(repository.listMessages(session.id)).toEqual([]);
    expectAppError(() => repository.markSessionFinalizing(session.id), "SESSION_NOT_ACTIVE");
  });

  it("rejects unsafe finalization attempts without deleting the transcript", () => {
    const session = repository.createTherapySession(primary.patient);
    repository.appendMessage(session.id, { role: "patient", content: "This must survive a bad save." });
    repository.markSessionFinalizing(session.id);

    expectAppError(
      () =>
        repository.finalizeSession(
          primary.clinician,
          session.id,
          {
            narrative: "Not authorized.",
            themes: [],
            followUps: [],
            safetyFlags: [],
            memories: [],
          },
          [],
          "test-chat",
          "test-v1",
        ),
      "SESSION_NOT_ACTIVE",
    );
    expectAppError(
      () =>
        repository.finalizeSession(
          primary.patient,
          session.id,
          {
            narrative: "Embedding mismatch.",
            themes: [],
            followUps: [],
            safetyFlags: [],
            memories: [DEFAULT_MEMORY, { ...DEFAULT_MEMORY, statement: "Walking helps too." }],
          },
          [{ id: "duplicate", embedding: [1, 0], embeddingModel: "test" }],
          "test-chat",
          "test-v1",
        ),
      "EXTRACTION_FAILED",
    );
    expect(repository.listMessages(session.id)).toHaveLength(1);
    expect(repository.getSessionSummary(primary.patient, session.id)).toBeNull();
  });

  it("records sanitized retrieval traces and exposes them only to linked principals", () => {
    const finalized = finalizeMemories();
    const memory = repository.transitionMemory(
      primary.clinician,
      finalized.memories[0]!.id,
      "approve",
    );
    const trace: RetrievalTrace = {
      candidateCount: 3,
      selected: [
        {
          id: memory.id,
          category: memory.category,
          statement: memory.statement!,
          score: {
            semantic: 0.91,
            importance: 0.8,
            recency: 0.7,
            confidence: 0.9,
            total: 0.85,
          },
          estimatedCharacters: 44,
        },
      ],
      contextCharacters: 44,
      contextLimit: 3_200,
      model: "test-chat",
      promptVersion: "retrieval-v1",
      latencyMs: 17,
    };
    const saved = repository.saveRetrievalRun(finalized.session.id, trace);
    expect(saved.id).toEqual(expect.any(String));
    expect(saved.createdAt).toBeInstanceOf(Date);
    expect(repository.listRetrievalRuns(primary.patient, finalized.session.id)).toEqual([
      expect.objectContaining({
        id: saved.id,
        selected: trace.selected,
        latencyMs: 17,
      }),
    ]);
    expect(repository.listRetrievalRuns(primary.clinician, finalized.session.id)).toHaveLength(1);
    expect(
      context.sqlite
        .prepare("SELECT COUNT(*) AS count FROM memory_events WHERE memory_id = ? AND action = 'retrieved'")
        .get(memory.id),
    ).toEqual({ count: 1 });

    const noSelection = repository.saveRetrievalRun(finalized.session.id, {
      ...trace,
      selected: [],
      candidateCount: 0,
      contextCharacters: 0,
      latencyMs: undefined,
    });
    expect(repository.listRetrievalRuns(primary.patient, finalized.session.id)[0]).toMatchObject({
      id: noSelection.id,
      selected: [],
      latencyMs: undefined,
    });
  });

  it("deduplicates and bounds safety follow-up reasons and degrades malformed arrays safely", () => {
    const session = repository.createTherapySession(primary.patient);
    repository.flagSafetyFollowUp(session.id, [
      "self-harm",
      "self-harm",
      "immediate-danger",
      "reason-3",
      "reason-4",
      "reason-5",
      "reason-6",
      "reason-7",
      "reason-8",
      "reason-9",
    ]);
    expect(repository.getTherapySession(primary.clinician, session.id)).toMatchObject({
      safetyFollowUp: true,
      safetyReasonCodes: [
        "self-harm",
        "immediate-danger",
        "reason-3",
        "reason-4",
        "reason-5",
        "reason-6",
        "reason-7",
        "reason-8",
      ],
    });

    context.sqlite
      .prepare("UPDATE therapy_sessions SET safety_reason_codes_json = ? WHERE id = ?")
      .run('{"not":"an array"}', session.id);
    expect(repository.getTherapySession(primary.patient, session.id)?.safetyReasonCodes).toEqual([]);
  });

  it("edits only reviewable memories and refreshes embedding metadata when re-embedded", () => {
    const finalized = finalizeMemories();
    const memoryId = finalized.memories[0]!.id;
    expectAppError(
      () => repository.updateMemory(primary.patient, memoryId, { statement: "Patient edit" }),
      "FORBIDDEN",
    );

    const edited = repository.updateMemory(primary.clinician, memoryId, {
      statement: "Box breathing helps me feel grounded.",
      importance: 5,
      embedding: [0.25, 0.5, 0.75],
      embeddingModel: "test-embedding-v2",
    });
    expect(edited).toMatchObject({
      statement: "Box breathing helps me feel grounded.",
      importance: 5,
      status: "proposed",
    });
    expect(
      context.sqlite
        .prepare(
          `SELECT embedding_model, embedding_dimensions, length(embedding_blob) AS bytes
           FROM memories WHERE id = ?`,
        )
        .get(memoryId),
    ).toEqual({ embedding_model: "test-embedding-v2", embedding_dimensions: 3, bytes: 12 });

    expect(
      repository.updateMemory(primary.clinician, memoryId, { embedding: [0.6, 0.4] }),
    ).toMatchObject({
      statement: "Box breathing helps me feel grounded.",
      importance: 5,
    });
    expect(
      context.sqlite
        .prepare(
          `SELECT embedding_model, embedding_dimensions, length(embedding_blob) AS bytes
           FROM memories WHERE id = ?`,
        )
        .get(memoryId),
    ).toEqual({ embedding_model: "test-embedding-v2", embedding_dimensions: 2, bytes: 8 });

    repository.transitionMemory(primary.patient, memoryId, "dispute");
    expect(
      repository.updateMemory(primary.clinician, memoryId, { importance: 3 }),
    ).toMatchObject({ status: "disputed", importance: 3 });
    repository.transitionMemory(primary.clinician, memoryId, "approve");
    expectAppError(
      () => repository.updateMemory(primary.clinician, memoryId, { importance: 4 }),
      "CONFLICT",
    );
  });

  it("authorizes memory edits by role, workspace, active consent, and reviewable state", () => {
    const first = finalizeMemories();
    const proposedId = first.memories[0]!.id;

    expect(repository.assertMemoryEditable(primary.clinician, proposedId)).toMatchObject({
      id: proposedId,
      status: "proposed",
    });
    expectAppError(
      () => repository.assertMemoryEditable(primary.patient, proposedId),
      "FORBIDDEN",
    );

    const other = createWorkspaceFixture();
    expectAppError(
      () => repository.assertMemoryEditable(other.clinician, proposedId),
      "NOT_FOUND",
    );

    context.sqlite
      .prepare(
        `UPDATE care_relationships SET consent_status = 'revoked', revoked_at = ?
         WHERE workspace_id = ? AND patient_id = ? AND clinician_id = ?`,
      )
      .run(
        new Date().toISOString(),
        primary.clinician.workspaceId,
        primary.patient.userId,
        primary.clinician.userId,
      );
    expectAppError(
      () => repository.assertMemoryEditable(primary.clinician, proposedId),
      "FORBIDDEN",
    );

    context.sqlite
      .prepare(
        `UPDATE care_relationships SET consent_status = 'granted', revoked_at = NULL
         WHERE workspace_id = ? AND patient_id = ? AND clinician_id = ?`,
      )
      .run(
        primary.clinician.workspaceId,
        primary.patient.userId,
        primary.clinician.userId,
      );
    repository.transitionMemory(primary.clinician, proposedId, "approve");
    expectAppError(
      () => repository.assertMemoryEditable(primary.clinician, proposedId),
      "CONFLICT",
    );
  });

  it("requires explicit clinician approval before superseding an active memory", () => {
    const original = finalizeMemories([
      { ...DEFAULT_MEMORY, statement: "Box breathing is my preferred grounding technique." },
    ]);
    const originalId = original.memories[0]!.id;
    repository.transitionMemory(primary.clinician, originalId, "approve");
    const replacement = finalizeMemories([
      {
        ...DEFAULT_MEMORY,
        statement: "Walking is now my preferred grounding technique.",
        supersedesMemoryId: originalId,
      },
    ]);
    const replacementId = replacement.memories[0]!.id;

    expect(repository.listActiveMemories(primary.patient.userId, primary.patient.workspaceId)).toEqual([
      expect.objectContaining({ id: originalId, status: "active" }),
    ]);
    expect(repository.transitionMemory(primary.clinician, replacementId, "approve")).toMatchObject({
      id: replacementId,
      status: "active",
    });
    expect(repository.listMemoriesForPrincipal(primary.patient, primary.patient.userId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: originalId, status: "superseded" }),
        expect.objectContaining({ id: replacementId, status: "active", supersedesId: originalId }),
      ]),
    );
    expect(
      context.sqlite
        .prepare("SELECT action FROM memory_events WHERE memory_id = ? AND action = 'superseded'")
        .get(originalId),
    ).toEqual({ action: "superseded" });
  });

  it("marks review complete only after every proposed memory is approved or rejected", () => {
    const finalized = finalizeMemories([
      DEFAULT_MEMORY,
      {
        category: "goal",
        statement: "I want to protect one quiet evening each week.",
        importance: 4,
        confidence: 0.85,
      },
    ]);
    const [first, second] = finalized.memories;
    repository.transitionMemory(primary.clinician, first!.id, "approve");
    expect(repository.getSessionSummary(primary.clinician, finalized.session.id)?.status).toBe(
      "pending_review",
    );
    expect(repository.transitionMemory(primary.clinician, second!.id, "reject").status).toBe(
      "rejected",
    );
    expect(repository.getSessionSummary(primary.clinician, finalized.session.id)?.status).toBe(
      "reviewed",
    );
    expect(
      context.sqlite
        .prepare("SELECT reviewer_id FROM session_summaries WHERE session_id = ?")
        .get(finalized.session.id),
    ).toEqual({ reviewer_id: primary.clinician.userId });
  });

  it("enforces transition roles and state machines without leaking memory existence", () => {
    const finalized = finalizeMemories();
    const memoryId = finalized.memories[0]!.id;
    expectAppError(() => repository.transitionMemory(primary.patient, memoryId, "approve"), "FORBIDDEN");
    expectAppError(() => repository.transitionMemory(primary.clinician, memoryId, "dispute"), "FORBIDDEN");

    repository.transitionMemory(primary.clinician, memoryId, "reject");
    expectAppError(() => repository.transitionMemory(primary.patient, memoryId, "dispute"), "CONFLICT");
    expectAppError(() => repository.transitionMemory(primary.clinician, memoryId, "reject"), "CONFLICT");
    expectAppError(
      () => repository.transitionMemory(primary.clinician, "unknown-memory", "approve"),
      "NOT_FOUND",
    );
  });

  it("permanently forgets content, embeddings, and retrieval copies while retaining content-free tombstones", () => {
    const finalized = finalizeMemories([
      DEFAULT_MEMORY,
      {
        category: "goal",
        statement: "I want one quiet evening each week.",
        importance: 4,
        confidence: 0.82,
      },
    ]);
    const memoryId = finalized.memories[0]!.id;
    const retainedMemoryId = finalized.memories[1]!.id;
    repository.updateMemory(primary.clinician, memoryId, { statement: "Edited sensitive statement." });
    repository.transitionMemory(primary.clinician, memoryId, "approve");
    repository.transitionMemory(primary.clinician, retainedMemoryId, "approve");
    repository.saveRetrievalRun(finalized.session.id, {
      candidateCount: 2,
      selected: [
        {
          id: memoryId,
          category: "coping_strategy",
          statement: "Edited sensitive statement.",
          score: {
            semantic: 0.9,
            importance: 0.8,
            recency: 0.7,
            confidence: 0.9,
            total: 0.84,
          },
          estimatedCharacters: 31,
        },
        {
          id: retainedMemoryId,
          category: "goal",
          statement: "I want one quiet evening each week.",
          score: {
            semantic: 0.75,
            importance: 0.8,
            recency: 0.7,
            confidence: 0.82,
            total: 0.76,
          },
          estimatedCharacters: 37,
        },
      ],
      contextCharacters: 68,
      contextLimit: 3_200,
      model: "test-chat",
      promptVersion: "retrieval-v1",
    });
    const forgotten = repository.transitionMemory(primary.patient, memoryId, "forget");

    expect(forgotten).toMatchObject({ status: "forgotten", statement: null });
    expect(
      context.sqlite
        .prepare(
          `SELECT statement, embedding_blob, embedding_model, embedding_dimensions
           FROM memories WHERE id = ?`,
        )
        .get(memoryId),
    ).toEqual({
      statement: null,
      embedding_blob: null,
      embedding_model: null,
      embedding_dimensions: null,
    });
    const audit = context.sqlite
      .prepare("SELECT action, before_json, after_json FROM memory_events WHERE memory_id = ?")
      .all(memoryId) as Array<{
      action: string;
      before_json: string | null;
      after_json: string | null;
    }>;
    expect(audit.some(({ action }) => action === "forgotten")).toBe(true);
    expect(audit.every(({ before_json, after_json }) => before_json === null && after_json === null)).toBe(
      true,
    );
    const rawTrace = context.sqlite
      .prepare("SELECT selected_json, context_characters FROM retrieval_runs WHERE session_id = ?")
      .get(finalized.session.id) as { selected_json: string; context_characters: number };
    expect(rawTrace.selected_json).not.toContain(memoryId);
    expect(rawTrace.selected_json).not.toContain("Edited sensitive statement.");
    expect(rawTrace.context_characters).toBe(37);
    expect(JSON.parse(rawTrace.selected_json)).toEqual([
      expect.objectContaining({
        id: retainedMemoryId,
        statement: "I want one quiet evening each week.",
      }),
    ]);
    expect(repository.listRetrievalRuns(primary.patient, finalized.session.id)[0]).toMatchObject({
      contextCharacters: 37,
      selected: [expect.objectContaining({ id: retainedMemoryId })],
    });
    expectAppError(() => repository.transitionMemory(primary.patient, memoryId, "forget"), "CONFLICT");
  });

  it("treats malformed JSON arrays and invalid vector blobs as unusable rather than memory context", () => {
    const finalized = finalizeMemories();
    const memoryId = finalized.memories[0]!.id;
    repository.transitionMemory(primary.clinician, memoryId, "approve");
    context.sqlite
      .prepare(
        `UPDATE session_summaries
         SET themes_json = ?, follow_ups_json = ?, safety_flags_json = ?
         WHERE session_id = ?`,
      )
      .run("not-json", '["valid",7]', "{}", finalized.session.id);
    context.sqlite
      .prepare(
        `UPDATE memories SET embedding_blob = ?, embedding_dimensions = ? WHERE id = ?`,
      )
      .run(Buffer.from([1, 2, 3]), 2, memoryId);

    expect(repository.getSessionSummary(primary.patient, finalized.session.id)).toMatchObject({
      themes: [],
      followUps: [],
      safetyFlags: [],
    });
    expect(repository.listActiveMemories(primary.patient.userId, primary.patient.workspaceId)[0]).toMatchObject({
      id: memoryId,
      embedding: null,
      embeddingDimensions: 2,
    });
  });

  it("rolls rate-limit windows over and returns a bounded retry delay on denial", () => {
    expect(repository.consumeRateLimit("ip:turns", 2, 60_000)).toEqual({
      allowed: true,
      retryAfterMs: 0,
    });
    expect(repository.consumeRateLimit("ip:turns", 2, 60_000).allowed).toBe(true);
    const denied = repository.consumeRateLimit("ip:turns", 2, 60_000);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBeGreaterThan(0);
    expect(denied.retryAfterMs).toBeLessThanOrEqual(60_000);

    context.sqlite
      .prepare("UPDATE rate_limit_buckets SET expires_at = ? WHERE key = ?")
      .run(new Date(Date.now() - 1).toISOString(), "ip:turns");
    expect(repository.consumeRateLimit("ip:turns", 2, 60_000)).toEqual({
      allowed: true,
      retryAfterMs: 0,
    });
    expect(
      context.sqlite.prepare("SELECT count, kind FROM rate_limit_buckets WHERE key = ?").get("ip:turns"),
    ).toEqual({ count: 1, kind: "window" });
  });

  it("enforces concurrency limits, floors releases, and recovers expired leases", () => {
    expect(repository.acquireConcurrency("workspace:streams", 2, 60_000)).toBe(true);
    expect(repository.acquireConcurrency("workspace:streams", 2, 60_000)).toBe(true);
    expect(repository.acquireConcurrency("workspace:streams", 2, 60_000)).toBe(false);
    repository.releaseConcurrency("workspace:streams");
    expect(repository.acquireConcurrency("workspace:streams", 2, 60_000)).toBe(true);
    repository.releaseConcurrency("workspace:streams");
    repository.releaseConcurrency("workspace:streams");
    repository.releaseConcurrency("workspace:streams");
    expect(
      context.sqlite.prepare("SELECT count FROM rate_limit_buckets WHERE key = ?").get("workspace:streams"),
    ).toEqual({ count: 0 });

    context.sqlite
      .prepare("UPDATE rate_limit_buckets SET count = 2, expires_at = ? WHERE key = ?")
      .run(new Date(Date.now() - 1).toISOString(), "workspace:streams");
    expect(repository.acquireConcurrency("workspace:streams", 2, 60_000)).toBe(true);
    expect(
      context.sqlite.prepare("SELECT count, kind FROM rate_limit_buckets WHERE key = ?").get(
        "workspace:streams",
      ),
    ).toEqual({ count: 1, kind: "concurrency" });
  });

  it("cleans abandoned transcripts, expired auth, workspaces, and limiter buckets transactionally", () => {
    const now = new Date(Date.now() + 60 * 60 * 1_000);
    const staleStartedAt = new Date(now.getTime() - 25 * 60 * 60 * 1_000).toISOString();
    const active = repository.createTherapySession(primary.patient);
    const failed = repository.createTherapySession(primary.patient);
    repository.appendMessage(active.id, { role: "patient", content: "stale active" });
    repository.appendMessage(failed.id, { role: "patient", content: "stale failed" });
    repository.markSessionFinalizing(failed.id);
    repository.markSessionFailed(failed.id);
    context.sqlite
      .prepare("UPDATE therapy_sessions SET started_at = ? WHERE id IN (?, ?)")
      .run(staleStartedAt, active.id, failed.id);

    repository.createAuthSession(
      primary.patientIdentity,
      "expired-current-workspace-auth",
      new Date(now.getTime() - 1),
    );
    const expiredWorkspace = createWorkspaceFixture();
    context.sqlite
      .prepare("UPDATE demo_workspaces SET expires_at = ? WHERE id = ?")
      .run(new Date(now.getTime() - 1).toISOString(), expiredWorkspace.patient.workspaceId);

    repository.consumeRateLimit("expired-rate", 1, 10_000);
    context.sqlite
      .prepare("UPDATE rate_limit_buckets SET expires_at = ? WHERE key = ?")
      .run(new Date(now.getTime() - 1).toISOString(), "expired-rate");

    expect(repository.cleanupExpired(now)).toEqual({ workspaces: 1, sessions: 2, rateLimits: 1 });
    expect(repository.listMessages(active.id)).toEqual([]);
    expect(repository.listMessages(failed.id)).toEqual([]);
    expect(
      context.sqlite
        .prepare("SELECT COUNT(*) AS count FROM auth_sessions WHERE token_hash = ?")
        .get("expired-current-workspace-auth"),
    ).toEqual({ count: 0 });
    expect(
      context.sqlite
        .prepare("SELECT COUNT(*) AS count FROM demo_workspaces WHERE id = ?")
        .get(expiredWorkspace.patient.workspaceId),
    ).toEqual({ count: 0 });
    expect(
      context.sqlite.prepare("SELECT COUNT(*) AS count FROM rate_limit_buckets WHERE key = ?").get(
        "expired-rate",
      ),
    ).toEqual({ count: 0 });
    expect(repository.findPrincipalByTokenHash("patient-hash-1")).not.toBeNull();
  });

  it("reports database health", () => {
    expect(repository.isHealthy()).toBe(true);
  });
});
